import { db, admin } from '@/lib/firebaseAdmin';
import {
  solveHBLinks,
  solveHubCDN,
  solveHubDrive,
  solveHubCloudNative,
  solveGadgetsWebNative,
} from '@/lib/solvers';
// v3 FIX: TIMER_API from config — NOT hardcoded (deleted line 25)
import {
  TIMER_API,
  TIMER_DOMAINS,
  LINK_TIMEOUT_MS,
  OVERALL_TIMEOUT_MS,
} from '@/lib/config';
// Phase 4: Link Cache
import { getCachedLink, setCachedLink } from '@/lib/cache';

export const maxDuration = 60;

// ─── HELPER: fetchJSON ────────────────────────────────────────────────────────
async function fetchJSON(url: string, timeoutMs = 20_000): Promise<any> {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal:  ctrl.signal,
      headers: { 'User-Agent': 'MflixPro/3.0' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err: any) {
    if (err.name === 'AbortError') throw new Error('Timed out');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ─── HELPER: saveToFirestore (stream version) ─────────────────────────────────
// v4 FIX B: Sub-collection architecture — zero Firestore contention
// v4 TRAP 1 FIX: FieldValue.increment(1) atomic counter
// v5 TRAP 5 FIX: CONDITIONAL increment — deferred (pending) links skip
async function saveToFirestore(
  taskId: string | undefined,
  lid: number | string,
  linkData: any,
  result: {
    status?: string;
    finalLink?: string | null;
    error?: string | null;
    logs?: any[];
    best_button_name?: string | null;
    all_available_buttons?: any[];
  },
  extractedBy: string,
): Promise<void> {
  if (!taskId) return;

  try {
    // TIER 1: Sub-collection write — each link its own doc (zero contention)
    await db
      .collection('scraping_tasks').doc(taskId)
      .collection('results').doc(String(lid))
      .set({
        lid,
        linkUrl:               linkData.link,
        finalLink:             result.finalLink            ?? null,
        status:                result.status               ?? 'error',
        error:                 result.error                ?? null,
        logs:                  result.logs                 ?? [],
        best_button_name:      result.best_button_name     ?? null,
        all_available_buttons: result.all_available_buttons ?? [],
        extractedBy,
        solvedAt: new Date().toISOString(),
      });

    // TIER 2: Master doc — conditional atomic increment + completion check
    const taskRef = db.collection('scraping_tasks').doc(taskId);
    const effectiveStatus = result.status ?? 'error';

    // v5 TRAP 5 FIX: SIRF non-pending results increment counter
    if (effectiveStatus !== 'pending') {
      await taskRef.update({
        completedLinksCount: admin.firestore.FieldValue.increment(1),
        extractedBy,
      });
    }

    const masterSnap = await taskRef.get();
    if (!masterSnap.exists) return;

    const data = masterSnap.data()!;
    const totalLinks: number    = (data.links ?? []).length;
    const completedCount: number = data.completedLinksCount ?? 0;

    if (completedCount >= totalLinks && totalLinks > 0) {
      const resultsSnap = await db
        .collection('scraping_tasks').doc(taskId)
        .collection('results').get();

      const allResults = resultsSnap.docs.map(d => d.data());
      const anySuccess = allResults.some(r => ['done', 'success'].includes(r.status ?? ''));

      await taskRef.update({
        status:      anySuccess ? 'completed' : 'failed',
        completedAt: new Date().toISOString(),
      });
    }
  } catch (e: any) {
    console.error('[Stream] DB save error:', e.message);
  }
}

// ─── POST /api/stream_solve ───────────────────────────────────────────────────
export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const links: any[]    = body?.links || [];
  const taskId: string  = body?.taskId;
  const extractedBy     = body?.extractedBy || 'Browser/Live';

  if (!links.length) {
    return new Response(JSON.stringify({ error: 'No links provided' }), { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder    = new TextEncoder();
      const overallStart = Date.now();

      const send = (data: any) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
        } catch { /* stream closed */ }
      };

      // ─── processLink (stream version) ──────────────────────────────────────
      const processLink = async (linkData: any, lid: number | string): Promise<void> => {
        const originalUrl = linkData.link;
        let   currentLink = originalUrl;
        const logs: { msg: string; type: string }[] = [];

        const log = (msg: string, type = 'info') => {
          logs.push({ msg, type });
          send({ id: lid, msg, type });
        };

        // Phase 4: CACHE CHECK — instant return if already resolved
        try {
          const cached = await getCachedLink(originalUrl);
          if (cached && cached.finalLink) {
            log('⚡ CACHE HIT — resolved in 0ms', 'success');
            // Save to Firestore via sub-collection (FIX B: no runTransaction)
            await saveToFirestore(taskId, lid, linkData, {
              status: 'done',
              finalLink: cached.finalLink,
              best_button_name: cached.best_button_name ?? null,
              all_available_buttons: cached.all_available_buttons ?? [],
              logs: [{ msg: '⚡ CACHE HIT', type: 'success' }],
            }, extractedBy);
            send({ id: lid, status: 'done', finalLink: cached.finalLink, best_button_name: cached.best_button_name });
            return;
          }
        } catch { /* cache miss */ }

        let resultPayload: any;

        try {
          const solving = async () => {
            // HubCDN.fans shortcut
            if (currentLink.includes('hubcdn.fans')) {
              log('⚡ HubCDN.fans detected — direct solve');
              const r = await solveHubCDN(currentLink);
              if (r.status === 'success') return { finalLink: r.final_link, status: 'done', logs };
              return { status: 'error', error: r.message, logs };
            }

            // Timer bypass loop
            let loopCount = 0;
            while (loopCount < 3 && !([ 'hblinks','hubdrive','hubcdn','hubcloud','gdflix','drivehub' ].some(d => currentLink.includes(d)))) {
              if (!TIMER_DOMAINS.some(d => currentLink.includes(d)) && loopCount === 0) break;

              if (currentLink.includes('gadgetsweb')) {
                log(`🔁 GadgetsWeb native solve (loop ${loopCount + 1})`);
                const r = await solveGadgetsWebNative(currentLink);
                if (r.status === 'success') { currentLink = r.link; loopCount++; continue; }
                log(`❌ GadgetsWeb failed: ${r.message}`, 'error');
                break;
              } else {
                // v3 FIX: TIMER_API from config, suffix added here
                log(`⏱ Timer bypass via VPS (loop ${loopCount + 1})`);
                const r = await fetchJSON(`${TIMER_API}/solve?url=${encodeURIComponent(currentLink)}`, 20_000);
                if (r.status === 'success' && r.extracted_link) { currentLink = r.extracted_link; loopCount++; continue; }
                log('❌ Timer bypass failed', 'error');
                break;
              }
            }

            // HBLinks
            if (currentLink.includes('hblinks')) {
              log('🔗 HBLinks solving...');
              const r = await solveHBLinks(currentLink);
              if (r.status === 'success') currentLink = r.link;
              else return { status: 'error', error: r.message, logs };
            }

            // HubDrive
            if (currentLink.includes('hubdrive')) {
              log('💾 HubDrive solving...');
              const r = await solveHubDrive(currentLink);
              if (r.status === 'success') currentLink = r.link;
              else return { status: 'error', error: r.message, logs };
            }

            // HubCloud / HubCDN
            if (currentLink.includes('hubcloud') || currentLink.includes('hubcdn')) {
              log('☁️ HubCloud solving...');
              const r = await solveHubCloudNative(currentLink);
              if (r.status === 'success') {
                log(`✅ Done: ${r.best_download_link}`, 'success');
                return {
                  finalLink:             r.best_download_link,  // ← HubCloudNativeResult uses best_download_link
                  status:                'done',
                  best_button_name:      r.best_button_name      ?? null,
                  all_available_buttons: r.all_available_buttons ?? [],
                  logs,
                };
              }
              return { status: 'error', error: r.message, logs };
            }

            // GDflix / DriveHub
            if (currentLink.includes('gdflix') || currentLink.includes('drivehub')) {
              log(`✅ Resolved: ${currentLink}`, 'success');
              return { finalLink: currentLink, status: 'done', logs };
            }

            log(`✅ Resolved: ${currentLink}`, 'success');
            return { finalLink: currentLink, status: 'done', logs };
          };

          resultPayload = await Promise.race([
            solving(),
            new Promise<any>((_, rej) =>
              setTimeout(() => rej(new Error(`Timeout ${LINK_TIMEOUT_MS / 1000}s`)), LINK_TIMEOUT_MS),
            ),
          ]);
        } catch (err: any) {
          resultPayload = { status: 'error', error: err.message, logs };
        }

        // Stream status update
        send({
          id:               lid,
          status:           resultPayload.status,
          final:            resultPayload.finalLink,
          best_button_name: resultPayload.best_button_name,
        });

        // Save to Firestore
        try {
          await saveToFirestore(taskId, lid, linkData, resultPayload, extractedBy);
        } catch { /* non-fatal */ }

        // Phase 4: Save to cache if solved successfully
        if (resultPayload.status === 'done' && resultPayload.finalLink) {
          try {
            await setCachedLink(originalUrl, resultPayload.finalLink, 'stream_solve', {
              best_button_name: resultPayload.best_button_name,
              all_available_buttons: resultPayload.all_available_buttons,
            });
          } catch { /* non-critical */ }
        }

        // Finished marker
        send({ id: lid, status: 'finished' });
      };

      // ─── Smart routing ──────────────────────────────────────────────────────
      // v3 FIX: l.id — links.indexOf(l) REMOVED (old lines 232, 238)
      const timerLinks  = links.filter(l => TIMER_DOMAINS.some(d => (l.link || '').includes(d)));
      const directLinks = links.filter(l => !TIMER_DOMAINS.some(d => (l.link || '').includes(d)));

      // Direct links — parallel
      const directPromises = directLinks.map((l: any) => processLink(l, l.id));

      // Timer links — sequential (index-based — indexOf REMOVED)
      const timerPromise = (async () => {
        for (let i = 0; i < timerLinks.length; i++) {
          const l = timerLinks[i];
          if (Date.now() - overallStart > OVERALL_TIMEOUT_MS) break;
          await processLink(l, l.id); // l.id, not indexOf
        }
      })();

      await Promise.allSettled([...directPromises, timerPromise]);

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':  'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  });
}
