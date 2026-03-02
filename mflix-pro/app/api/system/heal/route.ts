/**
 * /api/system/heal — Phase 4: Auto-Healing Engine
 *
 * GET /api/system/heal
 * Called by cron / manually to self-repair the system:
 * 1. VPS health check
 * 2. Stuck task recovery
 * 3. Queue deadlock detection
 * 4. Firebase cleanup (expired cache)
 * 5. Solver health matrix update
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import admin from 'firebase-admin';
import {
  STUCK_TASK_THRESHOLD_MS,
  TIMER_API,
  HUBCLOUD_API,
  CACHE_COLLECTION,
} from '@/lib/config';
import {
  notifyAction,
  notifyCritical,
  notifyWarning,
  alertVpsDown,
  alertVpsRecovered,
  alertStuckTasks,
  alertQueueBuildup,
  alertLowSuccessRate,
} from '@/lib/notifications';
import { cleanupExpiredCache } from '@/lib/cache';
import { trackVpsCheck } from '@/lib/analytics';

export const dynamic     = 'force-dynamic';
export const maxDuration = 60;

// ─── VPS Health Check ─────────────────────────────────────────────────────────
async function checkVps(apiUrl: string, label: string): Promise<{
  online: boolean;
  latencyMs: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    const res = await fetch(`${apiUrl}/health`, {
      signal: AbortSignal.timeout(8_000),
    });
    return { online: res.ok, latencyMs: Date.now() - start };
  } catch (err: any) {
    return { online: false, latencyMs: Date.now() - start, error: err?.message };
  }
}

// ─── Stuck Task Recovery ──────────────────────────────────────────────────────
async function recoverStuckTasks(): Promise<{ found: number; recovered: number }> {
  const threshold = new Date(Date.now() - STUCK_TASK_THRESHOLD_MS).toISOString();

  const snap = await db.collection('scraping_tasks')
    .where('status', '==', 'processing')
    .where('updatedAt', '<', threshold)
    .limit(20)
    .get();

  if (snap.empty) return { found: 0, recovered: 0 };

  const batch = db.batch();
  snap.docs.forEach(doc => {
    batch.update(doc.ref, {
      status: 'failed',
      error: 'Auto-healed: stuck in processing > 10 minutes',
      updatedAt: new Date().toISOString(),
    });
  });
  await batch.commit();

  return { found: snap.size, recovered: snap.size };
}

// ─── Queue Deadlock Detection ─────────────────────────────────────────────────
async function checkQueueDeadlocks(): Promise<{
  deadlocked: number;
  pending: number;
  alerts: string[];
}> {
  const alerts: string[] = [];
  const longStuckMs = 30 * 60 * 1000; // 30 minutes
  const deadlockThreshold = new Date(Date.now() - longStuckMs).toISOString();

  let deadlocked = 0;
  let totalPending = 0;

  for (const col of ['movies_queue', 'webseries_queue']) {
    // Force-reset items stuck as 'processing' > 30 minutes
    const deadlockedSnap = await db.collection(col)
      .where('status', '==', 'processing')
      .where('lockedAt', '<', deadlockThreshold)
      .limit(10)
      .get();

    if (!deadlockedSnap.empty) {
      const batch = db.batch();
      deadlockedSnap.docs.forEach(doc => {
        batch.update(doc.ref, {
          status: 'pending',
          lockedAt: null,
          error: 'Auto-healed: queue deadlock detected (30min stuck)',
        });
      });
      await batch.commit();
      deadlocked += deadlockedSnap.size;
    }

    // Count pending items
    const pendingSnap = await db.collection(col)
      .where('status', '==', 'pending')
      .count()
      .get();
    totalPending += pendingSnap.data().count;
  }

  if (deadlocked > 0) alerts.push(`Reset ${deadlocked} queue deadlock(s)`);
  if (totalPending > 50) alerts.push(`High queue depth: ${totalPending} pending`);

  return { deadlocked, pending: totalPending, alerts };
}

// ─── Success Rate Check ───────────────────────────────────────────────────────
async function checkSuccessRate(): Promise<{ rate: number; paused: boolean }> {
  try {
    const snap = await db.collection('scraping_tasks')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    if (snap.size < 10) return { rate: 100, paused: false };

    const completed = snap.docs.filter(d => d.data().status === 'completed').length;
    const rate      = Math.round((completed / snap.size) * 100);

    return { rate, paused: false };
  } catch {
    return { rate: 100, paused: false };
  }
}

// ─── Update System Health Matrix ──────────────────────────────────────────────
async function updateHealthMatrix(opts: {
  timerOnline: boolean;
  timerLatencyMs: number;
  hubcloudOnline: boolean;
  hubcloudLatencyMs: number;
  stuckRecovered: number;
  deadlockedReset: number;
  cacheDeleted: number;
  successRate: number;
  actions: string[];
}): Promise<void> {
  try {
    await db.collection('system').doc('health_matrix').set({
      vps: {
        timer: {
          status: opts.timerOnline ? 'online' : 'down',
          lastPing: new Date().toISOString(),
          latencyMs: opts.timerLatencyMs,
        },
        hubcloud: {
          status: opts.hubcloudOnline ? 'online' : 'down',
          lastPing: new Date().toISOString(),
          latencyMs: opts.hubcloudLatencyMs,
        },
      },
      lastHealRun: new Date().toISOString(),
      successRate: opts.successRate,
      actions: opts.actions,
      stuckRecovered:  opts.stuckRecovered,
      deadlockedReset: opts.deadlockedReset,
      cacheDeleted:    opts.cacheDeleted,
    }, { merge: true });
  } catch { /* non-critical */ }
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
export async function GET() {
  const startTime = Date.now();
  const actions:   string[] = [];
  let notificationsSent = 0;

  try {
    // ── Step 1: VPS Health Check ──
    const [timerHealth, hubcloudHealth] = await Promise.allSettled([
      checkVps(TIMER_API,    'Timer'),
      checkVps(HUBCLOUD_API, 'HubCloud'),
    ]);

    const timerResult    = timerHealth.status    === 'fulfilled' ? timerHealth.value    : { online: false, latencyMs: 0 };
    const hubcloudResult = hubcloudHealth.status === 'fulfilled' ? hubcloudHealth.value : { online: false, latencyMs: 0 };

    // Track VPS health in analytics
    await trackVpsCheck({
      timerOnline:         timerResult.online,
      hubcloudOnline:      hubcloudResult.online,
      timerLatencyMs:      timerResult.latencyMs,
      hubcloudLatencyMs:   hubcloudResult.latencyMs,
    });

    // VPS status update in Firebase
    const vpsStatusUpdate: Record<string, any> = {};
    if (!timerResult.online)    vpsStatusUpdate.timerVpsDown    = true;
    if (!hubcloudResult.online) vpsStatusUpdate.hubcloudVpsDown = true;

    if (!timerResult.online || !hubcloudResult.online) {
      // Check consecutive failures in health matrix
      const matrixSnap = await db.collection('system').doc('health_matrix').get();
      const matrixData = matrixSnap.exists ? matrixSnap.data()! : {};

      const timerFailures    = !timerResult.online    ? (matrixData?.vps?.timer?.consecutiveFailures    ?? 0) + 1 : 0;
      const hubcloudFailures = !hubcloudResult.online ? (matrixData?.vps?.hubcloud?.consecutiveFailures ?? 0) + 1 : 0;

      // Alert after 3 consecutive failures (~15 min with 5min cron)
      if (timerFailures >= 3) {
        await alertVpsDown('10000 (Timer)', timerFailures * 5);
        notificationsSent++;
      }
      if (hubcloudFailures >= 3) {
        await alertVpsDown('5001 (HubCloud)', hubcloudFailures * 5);
        notificationsSent++;
      }

      actions.push(
        `VPS check: Timer=${timerResult.online ? 'online' : 'DOWN'}, HubCloud=${hubcloudResult.online ? 'online' : 'DOWN'}`,
      );
    } else {
      // Both online — check if previously reported as down
      const matrixSnap = await db.collection('system').doc('health_matrix').get();
      const matrixData = matrixSnap.exists ? matrixSnap.data()! : {};
      if (matrixData?.vps?.timer?.consecutiveFailures >= 3) {
        await alertVpsRecovered('10000 (Timer)');
        notificationsSent++;
      }
      if (matrixData?.vps?.hubcloud?.consecutiveFailures >= 3) {
        await alertVpsRecovered('5001 (HubCloud)');
        notificationsSent++;
      }
      actions.push(`VPS check: Both online (Timer ${timerResult.latencyMs}ms, HubCloud ${hubcloudResult.latencyMs}ms)`);
    }

    // ── Step 2: Stuck Task Recovery ──
    const { found: stuckFound, recovered: stuckRecovered } = await recoverStuckTasks();
    if (stuckFound > 0) {
      actions.push(`Stuck task recovery: found=${stuckFound}, recovered=${stuckRecovered}`);
      await alertStuckTasks(stuckFound, stuckRecovered);
      notificationsSent++;
    }

    // ── Step 3: Queue Deadlock Detection ──
    const { deadlocked, pending, alerts: queueAlerts } = await checkQueueDeadlocks();
    actions.push(...queueAlerts);
    if (deadlocked > 0) {
      await notifyAction('Queue Deadlock Fixed', `${deadlocked} queue item(s) force-reset to pending.`);
      notificationsSent++;
    }
    if (pending > 50) {
      await alertQueueBuildup(pending);
      notificationsSent++;
    }

    // ── Step 4: Firebase Cleanup ──
    const cacheDeleted = await cleanupExpiredCache();
    if (cacheDeleted > 0) {
      actions.push(`Cache cleanup: ${cacheDeleted} expired entries deleted`);
    }

    // ── Step 5: Success Rate Check ──
    const { rate: successRate } = await checkSuccessRate();
    if (successRate < 50 && successRate > 0) {
      await alertLowSuccessRate(successRate);
      notificationsSent++;
      actions.push(`Low success rate alert sent: ${successRate}%`);
    }

    // ── Update Health Matrix ──
    await updateHealthMatrix({
      timerOnline:       timerResult.online,
      timerLatencyMs:    timerResult.latencyMs,
      hubcloudOnline:    hubcloudResult.online,
      hubcloudLatencyMs: hubcloudResult.latencyMs,
      stuckRecovered,
      deadlockedReset: deadlocked,
      cacheDeleted,
      successRate,
      actions,
    });

    const elapsed = Date.now() - startTime;

    return NextResponse.json({
      ok: true,
      elapsed,
      vps: {
        timer:    { online: timerResult.online,    latencyMs: timerResult.latencyMs },
        hubcloud: { online: hubcloudResult.online, latencyMs: hubcloudResult.latencyMs },
      },
      stuckRecovered,
      deadlockedReset: deadlocked,
      pendingQueueItems: pending,
      cacheDeleted,
      successRate,
      notificationsSent,
      actions,
    });

  } catch (err: any) {
    await notifyCritical('Heal Engine Error', err?.message ?? 'Unknown error in /api/system/heal');
    return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 });
  }
}
