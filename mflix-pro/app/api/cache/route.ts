/**
 * /api/cache — Phase 4: Cache Management API
 *
 * GET  /api/cache          → Cache stats
 * DELETE /api/cache        → Purge all expired cache entries
 * DELETE /api/cache?all=1  → Purge ALL cache entries (full reset)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { getCacheStats, cleanupExpiredCache } from '@/lib/cache';
import { CACHE_COLLECTION } from '@/lib/config';

export const dynamic     = 'force-dynamic';
export const maxDuration = 30;

// ─── GET — Cache Stats ────────────────────────────────────────────────────────
export async function GET() {
  try {
    const stats = await getCacheStats();

    // Also get top cached links (most hit)
    const topSnap = await db.collection(CACHE_COLLECTION)
      .orderBy('hitCount', 'desc')
      .limit(10)
      .get();

    const topHits = topSnap.docs.map(doc => {
      const d = doc.data();
      return {
        hash:        doc.id,
        originalUrl: (d.originalUrl as string)?.substring(0, 80) + '…',
        solverUsed:  d.solverUsed,
        hitCount:    d.hitCount ?? 0,
        resolvedAt:  d.resolvedAt,
        expiresAt:   d.expiresAt,
        status:      d.status,
      };
    });

    // Recent entries
    const recentSnap = await db.collection(CACHE_COLLECTION)
      .orderBy('resolvedAt', 'desc')
      .limit(5)
      .get();

    const recentEntries = recentSnap.docs.map(doc => {
      const d = doc.data();
      return {
        hash:        doc.id,
        originalUrl: (d.originalUrl as string)?.substring(0, 80) + '…',
        solverUsed:  d.solverUsed,
        hitCount:    d.hitCount ?? 0,
        resolvedAt:  d.resolvedAt,
        expiresAt:   d.expiresAt,
        status:      d.status,
      };
    });

    return NextResponse.json({
      ok: true,
      stats,
      topHits,
      recentEntries,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
  }
}

// ─── DELETE — Purge Cache ─────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const purgeAll = searchParams.get('all') === '1';

  try {
    if (purgeAll) {
      // Delete ALL cache entries
      let total = 0;
      let hasMore = true;

      while (hasMore) {
        const snap = await db.collection(CACHE_COLLECTION).limit(100).get();
        if (snap.empty) { hasMore = false; break; }

        const batch = db.batch();
        snap.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        total += snap.size;

        if (snap.size < 100) hasMore = false;
      }

      return NextResponse.json({ ok: true, deleted: total, type: 'full_purge' });
    }

    // Default: delete expired entries only
    const deleted = await cleanupExpiredCache();
    return NextResponse.json({ ok: true, deleted, type: 'expired_only' });

  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
  }
}
