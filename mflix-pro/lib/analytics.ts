/**
 * lib/analytics.ts — Phase 4: Analytics Tracking Helpers
 *
 * analytics_daily/{YYYY-MM-DD} collection mein stats track karta hai.
 * Atomic increments use karta hai (no read-before-write needed).
 */

import { db } from './firebaseAdmin';
import admin from 'firebase-admin';

const COLLECTION = 'analytics_daily';

// ─── Date Key ─────────────────────────────────────────────────────────────────
export function getTodayKey(): string {
  return new Date().toISOString().split('T')[0]!; // 'YYYY-MM-DD'
}

// ─── Track Task Processed ─────────────────────────────────────────────────────
export async function trackTaskProcessed(opts: {
  success: boolean;
  processingTimeMs: number;
  linksTotal: number;
  linksDone: number;
  linksFailed: number;
  fromCache: boolean;
  solver?: string;
}): Promise<void> {
  try {
    const key = getTodayKey();
    const ref = db.collection(COLLECTION).doc(key);
    const increment = admin.firestore.FieldValue.increment;
    const hour = new Date().getHours();

    const update: Record<string, any> = {
      totalProcessed:  increment(1),
      totalLinksProcessed: increment(opts.linksTotal),
      doneLinks:       increment(opts.linksDone),
      failedLinks:     increment(opts.linksFailed),
      updatedAt:       new Date().toISOString(),
    };

    if (opts.success) {
      update.totalSuccess      = increment(1);
      update.totalProcessingMs = increment(opts.processingTimeMs);
    } else {
      update.totalFailed = increment(1);
    }

    if (opts.fromCache) {
      update.cacheHits = increment(1);
    } else {
      update.cacheMisses = increment(1);
    }

    // Track solver breakdown
    if (opts.solver) {
      const solverField = `solverBreakdown.${opts.solver}.${opts.success ? 'success' : 'fail'}`;
      const solverTimeField = `solverBreakdown.${opts.solver}.totalTimeMs`;
      update[solverField]    = increment(1);
      update[solverTimeField] = increment(opts.processingTimeMs);
    }

    // Track peak hour
    update[`hourlyBreakdown.h${hour}`] = increment(1);

    await ref.set(update, { merge: true });
  } catch {
    // Analytics failure should NEVER break main flow
  }
}

// ─── Track Cache Hit/Miss ─────────────────────────────────────────────────────
export async function trackCacheEvent(type: 'hit' | 'miss'): Promise<void> {
  try {
    const key = getTodayKey();
    const ref = db.collection(COLLECTION).doc(key);
    const increment = admin.firestore.FieldValue.increment;
    await ref.set(
      { [type === 'hit' ? 'cacheHits' : 'cacheMisses']: increment(1), updatedAt: new Date().toISOString() },
      { merge: true },
    );
  } catch { /* non-critical */ }
}

// ─── Track Error ──────────────────────────────────────────────────────────────
export async function trackError(errorMessage: string): Promise<void> {
  try {
    const key   = getTodayKey();
    const ref   = db.collection(COLLECTION).doc(key);
    const short = errorMessage.substring(0, 80).replace(/[.\[\]#$/]/g, '_');
    await ref.set(
      {
        [`errors.${short}`]: admin.firestore.FieldValue.increment(1),
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  } catch { /* non-critical */ }
}

// ─── Track VPS Health ─────────────────────────────────────────────────────────
export async function trackVpsCheck(opts: {
  timerOnline: boolean;
  hubcloudOnline: boolean;
  timerLatencyMs?: number;
  hubcloudLatencyMs?: number;
}): Promise<void> {
  try {
    const key = getTodayKey();
    const ref = db.collection(COLLECTION).doc(key);
    const increment = admin.firestore.FieldValue.increment;

    const update: Record<string, any> = {
      'vps.totalChecks': increment(1),
      updatedAt: new Date().toISOString(),
    };

    if (opts.timerOnline)    update['vps.timerOnline']    = increment(1);
    if (opts.hubcloudOnline) update['vps.hubcloudOnline'] = increment(1);
    if (opts.timerLatencyMs)    update['vps.timerTotalLatencyMs']    = increment(opts.timerLatencyMs);
    if (opts.hubcloudLatencyMs) update['vps.hubcloudTotalLatencyMs'] = increment(opts.hubcloudLatencyMs);

    await ref.set(update, { merge: true });
  } catch { /* non-critical */ }
}

// ─── Get Analytics for Date Range ────────────────────────────────────────────
export async function getAnalyticsRange(days = 7): Promise<AnalyticsDay[]> {
  const results: AnalyticsDay[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const d    = new Date();
    d.setDate(d.getDate() - i);
    const key  = d.toISOString().split('T')[0]!;
    const snap = await db.collection(COLLECTION).doc(key).get();

    if (snap.exists) {
      const data = snap.data()!;
      const total     = data.totalProcessed ?? 0;
      const success   = data.totalSuccess   ?? 0;
      const totalMs   = data.totalProcessingMs ?? 0;
      const cacheHits = data.cacheHits ?? 0;
      const cacheMiss = data.cacheMisses ?? 0;

      results.push({
        date:              key,
        totalProcessed:    total,
        totalSuccess:      success,
        totalFailed:       data.totalFailed ?? 0,
        successRate:       total > 0 ? Math.round((success / total) * 100) : 0,
        avgProcessingTimeMs: total > 0 ? Math.round(totalMs / total) : 0,
        cacheHits,
        cacheMisses:       cacheMiss,
        cacheHitRate:      (cacheHits + cacheMiss) > 0
          ? Math.round((cacheHits / (cacheHits + cacheMiss)) * 100)
          : 0,
        vpsUptimePercent:  computeVpsUptime(data.vps),
        solverBreakdown:   data.solverBreakdown ?? {},
        topErrors:         extractTopErrors(data.errors ?? {}),
        peakHour:          extractPeakHour(data.hourlyBreakdown ?? {}),
        totalLinksProcessed: data.totalLinksProcessed ?? 0,
        doneLinks:           data.doneLinks ?? 0,
        failedLinks:         data.failedLinks ?? 0,
      });
    } else {
      results.push({
        date: key, totalProcessed: 0, totalSuccess: 0, totalFailed: 0,
        successRate: 0, avgProcessingTimeMs: 0, cacheHits: 0, cacheMisses: 0,
        cacheHitRate: 0, vpsUptimePercent: 100, solverBreakdown: {},
        topErrors: [], peakHour: null, totalLinksProcessed: 0, doneLinks: 0, failedLinks: 0,
      });
    }
  }

  return results;
}

function computeVpsUptime(vpsData?: Record<string, any>): number {
  if (!vpsData) return 100;
  const total   = vpsData.totalChecks ?? 0;
  const online  = ((vpsData.timerOnline ?? 0) + (vpsData.hubcloudOnline ?? 0)) / 2;
  return total > 0 ? Math.round((online / total) * 100) : 100;
}

function extractTopErrors(errors: Record<string, number>): Array<{ message: string; count: number }> {
  return Object.entries(errors)
    .map(([message, count]) => ({ message: message.replace(/_/g, '.'), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function extractPeakHour(hourly: Record<string, number>): number | null {
  const entries = Object.entries(hourly);
  if (entries.length === 0) return null;
  const peak = entries.sort((a, b) => b[1] - a[1])[0];
  return peak ? parseInt(peak[0].replace('h', ''), 10) : null;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface AnalyticsDay {
  date: string;
  totalProcessed: number;
  totalSuccess: number;
  totalFailed: number;
  successRate: number;
  avgProcessingTimeMs: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;
  vpsUptimePercent: number;
  solverBreakdown: Record<string, { success?: number; fail?: number; totalTimeMs?: number }>;
  topErrors: Array<{ message: string; count: number }>;
  peakHour: number | null;
  totalLinksProcessed: number;
  doneLinks: number;
  failedLinks: number;
}
