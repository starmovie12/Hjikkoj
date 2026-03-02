/**
 * /api/analytics — Phase 4: Analytics Data API
 *
 * GET /api/analytics?days=7       → Last N days stats
 * GET /api/analytics?today=true   → Today's stats only
 * DELETE /api/analytics?purge=old → Delete data older than 30 days
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { getAnalyticsRange, getTodayKey } from '@/lib/analytics';
import { STUCK_TASK_THRESHOLD_MS } from '@/lib/config';

export const dynamic     = 'force-dynamic';
export const maxDuration = 30;

// ─── GET ──────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const todayOnly = searchParams.get('today') === 'true';
  const days      = Math.min(30, Math.max(1, parseInt(searchParams.get('days') ?? '7', 10)));

  try {
    // Health matrix (solver + VPS status)
    const [matrixSnap, queueStats] = await Promise.allSettled([
      db.collection('system').doc('health_matrix').get(),
      getQueueStats(),
    ]);

    const healthMatrix = matrixSnap.status === 'fulfilled' && matrixSnap.value.exists
      ? matrixSnap.value.data()
      : null;

    const queue = queueStats.status === 'fulfilled' ? queueStats.value : null;

    if (todayOnly) {
      const key    = getTodayKey();
      const todaySnap = await db.collection('analytics_daily').doc(key).get();
      const todayData = todaySnap.exists ? todaySnap.data()! : {};

      const total   = todayData.totalProcessed   ?? 0;
      const success = todayData.totalSuccess      ?? 0;
      const totalMs = todayData.totalProcessingMs ?? 0;
      const ch      = todayData.cacheHits         ?? 0;
      const cm      = todayData.cacheMisses        ?? 0;

      return NextResponse.json({
        ok: true,
        today: {
          date:              key,
          totalProcessed:    total,
          totalSuccess:      success,
          totalFailed:       todayData.totalFailed ?? 0,
          successRate:       total > 0 ? Math.round((success / total) * 100) : 0,
          avgProcessingTimeMs: total > 0 ? Math.round(totalMs / total) : 0,
          cacheHits:         ch,
          cacheMisses:       cm,
          cacheHitRate:      (ch + cm) > 0 ? Math.round((ch / (ch + cm)) * 100) : 0,
          totalLinksProcessed: todayData.totalLinksProcessed ?? 0,
          doneLinks:           todayData.doneLinks           ?? 0,
          failedLinks:         todayData.failedLinks         ?? 0,
          solverBreakdown:   todayData.solverBreakdown ?? {},
          topErrors:         extractTopErrors(todayData.errors ?? {}),
        },
        healthMatrix,
        queue,
      });
    }

    // Multi-day range
    const range = await getAnalyticsRange(days);

    // Trend calculation (today vs yesterday)
    const trend = range.length >= 2
      ? computeTrend(range[range.length - 2]!.successRate, range[range.length - 1]!.successRate)
      : 0;

    return NextResponse.json({
      ok: true,
      range,
      trend,
      healthMatrix,
      queue,
    });

  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
  }
}

// ─── DELETE — Purge old data ──────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  if (searchParams.get('purge') !== 'old') {
    return NextResponse.json({ ok: false, error: 'Use ?purge=old' }, { status: 400 });
  }

  try {
    // Delete analytics older than 30 days
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    const snap = await db.collection('analytics_daily').get();
    const batch = db.batch();
    let deleted = 0;

    snap.docs.forEach(doc => {
      if (doc.id < cutoff.toISOString().split('T')[0]!) {
        batch.delete(doc.ref);
        deleted++;
      }
    });

    if (deleted > 0) await batch.commit();

    return NextResponse.json({ ok: true, deleted });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function getQueueStats(): Promise<{
  movies: { pending: number; processing: number; completed: number; failed: number };
  webseries: { pending: number; processing: number; completed: number; failed: number };
}> {
  const [mSnap, wSnap] = await Promise.allSettled([
    db.collection('movies_queue').get(),
    db.collection('webseries_queue').get(),
  ]);

  const countByStatus = (docs: FirebaseFirestore.DocumentSnapshot[]) => {
    const result = { pending: 0, processing: 0, completed: 0, failed: 0 };
    docs.forEach(d => {
      const s = d.data()?.status as keyof typeof result;
      if (s in result) result[s]++;
    });
    return result;
  };

  return {
    movies:    mSnap.status === 'fulfilled' ? countByStatus(mSnap.value.docs)  : { pending: 0, processing: 0, completed: 0, failed: 0 },
    webseries: wSnap.status === 'fulfilled' ? countByStatus(wSnap.value.docs) : { pending: 0, processing: 0, completed: 0, failed: 0 },
  };
}

function extractTopErrors(errors: Record<string, number>): Array<{ message: string; count: number }> {
  return Object.entries(errors)
    .map(([message, count]) => ({ message: message.replace(/_/g, '.'), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function computeTrend(prev: number, curr: number): number {
  if (prev === 0) return 0;
  return Math.round(((curr - prev) / prev) * 100);
}
