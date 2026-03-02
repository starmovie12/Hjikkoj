/**
 * /api/events/[taskId] — Phase 4: Server-Sent Events (SSE)
 *
 * GET /api/events/{taskId}
 * Frontend is endpoint se connect karta hai — backend Firebase changes ko
 * real-time push karta hai. Zero polling needed for active task.
 *
 * Vercel Hobby Limitation: 60s max → auto-reconnect frontend side pe.
 * Fallback: 5s polling agar SSE fail ho.
 */

import { NextRequest } from 'next/server';
import { db } from '@/lib/firebaseAdmin';

export const dynamic     = 'force-dynamic';
export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await params;

  if (!taskId) {
    return new Response('Missing taskId', { status: 400 });
  }

  // Validate task exists first
  try {
    const doc = await db.collection('scraping_tasks').doc(taskId).get();
    if (!doc.exists) {
      return new Response('Task not found', { status: 404 });
    }
  } catch {
    return new Response('Firebase error', { status: 500 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection event
      const connectEvent = `event: connected\ndata: ${JSON.stringify({ taskId, ts: Date.now() })}\n\n`;
      controller.enqueue(encoder.encode(connectEvent));

      // Keep-alive ping every 20 seconds (Vercel keepalive)
      let pingCount = 0;
      const pingInterval = setInterval(() => {
        try {
          pingCount++;
          const ping = `event: ping\ndata: ${JSON.stringify({ ping: pingCount, ts: Date.now() })}\n\n`;
          controller.enqueue(encoder.encode(ping));

          // After 55s, send 'reconnect' signal — let client reconnect cleanly
          if (pingCount >= 2) {
            const reconnectEvt = `event: reconnect\ndata: ${JSON.stringify({ reason: 'approaching_limit' })}\n\n`;
            controller.enqueue(encoder.encode(reconnectEvt));
          }
        } catch { /* controller may be closed */ }
      }, 20_000);

      // Firebase onSnapshot — server-side Admin SDK (allowed!)
      const unsubscribe = db.collection('scraping_tasks')
        .doc(taskId)
        .onSnapshot(
          (snap) => {
            try {
              if (!snap.exists) {
                const evt = `event: deleted\ndata: ${JSON.stringify({ taskId })}\n\n`;
                controller.enqueue(encoder.encode(evt));
                return;
              }

              const data  = snap.data()!;
              const event = `data: ${JSON.stringify({
                id:       taskId,
                status:   data.status,
                links:    data.links ?? [],
                preview:  data.preview,
                metadata: data.metadata,
                updatedAt: data.updatedAt,
                completedLinksCount: data.completedLinksCount ?? 0,
                totalLinks: data.totalLinks ?? 0,
              })}\n\n`;

              controller.enqueue(encoder.encode(event));

              // If task is terminal state, close after sending final update
              if (data.status === 'completed' || data.status === 'failed') {
                setTimeout(() => {
                  try {
                    const doneEvt = `event: done\ndata: ${JSON.stringify({ status: data.status })}\n\n`;
                    controller.enqueue(encoder.encode(doneEvt));
                    clearInterval(pingInterval);
                    unsubscribe();
                    controller.close();
                  } catch { /* already closed */ }
                }, 500);
              }
            } catch { /* controller may be closed */ }
          },
          (err) => {
            // Firebase error — send error event then close
            try {
              const errEvt = `event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`;
              controller.enqueue(encoder.encode(errEvt));
            } catch { /* already closed */ }
            clearInterval(pingInterval);
            unsubscribe();
            try { controller.close(); } catch { /* already closed */ }
          },
        );

      // Cleanup on client disconnect
      req.signal.addEventListener('abort', () => {
        clearInterval(pingInterval);
        unsubscribe();
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}
