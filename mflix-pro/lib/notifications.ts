/**
 * lib/notifications.ts — Phase 4: Smart Notifications System
 *
 * Multi-level Telegram alerts with severity classification.
 * Level 1=INFO, Level 2=WARNING, Level 3=CRITICAL, Level 4=AUTO-ACTION
 */

export type NotificationLevel = 'info' | 'warning' | 'critical' | 'action';

export interface NotificationPayload {
  level: NotificationLevel;
  title: string;
  message: string;
  metadata?: Record<string, string | number | boolean>;
}

// ─── Core Telegram Send ───────────────────────────────────────────────────────
async function sendTelegramRaw(text: string, silent = false): Promise<boolean> {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_notification: silent,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Level Formatters ─────────────────────────────────────────────────────────
const LEVEL_CONFIG: Record<NotificationLevel, { emoji: string; label: string; silent: boolean }> = {
  info:     { emoji: '✅', label: 'INFO',    silent: true  },
  warning:  { emoji: '⚠️',  label: 'WARNING', silent: false },
  critical: { emoji: '🚨', label: 'CRITICAL', silent: false },
  action:   { emoji: '🔧', label: 'AUTO-FIX', silent: true  },
};

function formatMessage(payload: NotificationPayload): string {
  const cfg = LEVEL_CONFIG[payload.level];
  const lines: string[] = [
    `${cfg.emoji} <b>MFLIX PRO — ${cfg.label}</b>`,
    `<b>${payload.title}</b>`,
    payload.message,
  ];

  if (payload.metadata && Object.keys(payload.metadata).length > 0) {
    lines.push('');
    for (const [k, v] of Object.entries(payload.metadata)) {
      lines.push(`• <code>${k}</code>: ${v}`);
    }
  }

  lines.push(`\n<i>${new Date().toISOString()}</i>`);
  return lines.join('\n');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Send a notification at the given level.
 * INFO/ACTION are sent silently; WARNING/CRITICAL with sound.
 */
export async function notify(payload: NotificationPayload): Promise<void> {
  const cfg = LEVEL_CONFIG[payload.level];
  const text = formatMessage(payload);
  await sendTelegramRaw(text, cfg.silent);
}

// ─── Convenience helpers ──────────────────────────────────────────────────────

export const notifyInfo = (title: string, message: string, meta?: Record<string, string | number | boolean>) =>
  notify({ level: 'info', title, message, metadata: meta });

export const notifyWarning = (title: string, message: string, meta?: Record<string, string | number | boolean>) =>
  notify({ level: 'warning', title, message, metadata: meta });

export const notifyCritical = (title: string, message: string, meta?: Record<string, string | number | boolean>) =>
  notify({ level: 'critical', title, message, metadata: meta });

export const notifyAction = (title: string, message: string, meta?: Record<string, string | number | boolean>) =>
  notify({ level: 'action', title, message, metadata: meta });

// ─── Daily Summary Report ─────────────────────────────────────────────────────
export interface DailySummaryData {
  date: string;
  totalProcessed: number;
  successRate: number;
  avgProcessingTime: number;
  cacheHits: number;
  cacheMisses: number;
  totalLinks: number;
  doneLinks: number;
  failedLinks: number;
  vpsUptimePercent: number;
  pending: number;
  failed: number;
  topErrors: Array<{ message: string; count: number }>;
  trendPercent?: number; // positive = improvement
}

export async function sendDailySummary(data: DailySummaryData): Promise<void> {
  const cacheHitPct = data.cacheHits + data.cacheMisses > 0
    ? Math.round((data.cacheHits / (data.cacheHits + data.cacheMisses)) * 100)
    : 0;

  const trendStr = data.trendPercent != null
    ? data.trendPercent >= 0
      ? `↗️ ${data.trendPercent}% improvement from yesterday`
      : `↘️ ${Math.abs(data.trendPercent)}% decline from yesterday`
    : '';

  const errorLines = data.topErrors.slice(0, 3).map((e, i) =>
    `${i + 1}. ${e.message.substring(0, 60)} — ${e.count}x`
  );

  const text = [
    `📊 <b>MFLIX PRO — Daily Report (${data.date})</b>`,
    '',
    `🎬 Processed: <b>${data.totalProcessed}</b> movies | ✅ Success: <b>${data.successRate}%</b>`,
    `⏱ Avg Time: <b>${Math.round(data.avgProcessingTime / 1000)}s</b> | ⚡ Cache Hits: <b>${cacheHitPct}%</b>`,
    `🔗 Total Links: <b>${data.totalLinks}</b> | Done: <b>${data.doneLinks}</b> | Failed: <b>${data.failedLinks}</b>`,
    `🖥 VPS Uptime: <b>${data.vpsUptimePercent}%</b>`,
    `📋 Queue: <b>${data.pending}</b> pending | <b>${data.failed}</b> failed`,
    '',
    ...(errorLines.length > 0 ? ['<b>Top Issues:</b>', ...errorLines, ''] : []),
    ...(trendStr ? [`🔮 Trend: ${trendStr}`] : []),
  ].join('\n');

  await sendTelegramRaw(text, true);
}

// ─── VPS Alert ────────────────────────────────────────────────────────────────
export async function alertVpsDown(port: string, durationMin: number): Promise<void> {
  await notifyCritical(
    'VPS DOWN',
    `VPS Port ${port} ${durationMin} minute se offline hai.\nAuto-pause kiya gaya queue processing.`,
    { port, durationMin, action: 'Queue paused' },
  );
}

export async function alertVpsRecovered(port: string): Promise<void> {
  await notifyAction(
    'VPS Recovered',
    `VPS Port ${port} wapas online aa gaya. Queue processing resume kar raha hai.`,
    { port },
  );
}

// ─── Stuck Task Alert ─────────────────────────────────────────────────────────
export async function alertStuckTasks(count: number, recovered: number): Promise<void> {
  if (recovered > 0) {
    await notifyAction(
      'Stuck Tasks Auto-Recovered',
      `${recovered} stuck task(s) auto-reset kiye gaye.`,
      { stuckFound: count, recovered },
    );
  } else if (count > 0) {
    await notifyWarning(
      'Stuck Tasks Detected',
      `${count} task(s) 10+ minutes se stuck hain. Auto-recovery try kiya ja raha hai.`,
      { count },
    );
  }
}

// ─── Low Success Rate Alert ───────────────────────────────────────────────────
export async function alertLowSuccessRate(rate: number, solver?: string): Promise<void> {
  const msg = solver
    ? `Solver "${solver}" ki success rate ${rate}% tak gir gayi.`
    : `Overall success rate ${rate}% tak gir gayi.`;
  await notifyWarning('Low Success Rate', msg, { rate, solver: solver ?? 'all' });
}

// ─── Queue Buildup Alert ──────────────────────────────────────────────────────
export async function alertQueueBuildup(pendingCount: number): Promise<void> {
  await notifyWarning(
    'Queue Building Up',
    `${pendingCount}+ items queue mein pending hain. Cron frequency increase karo.`,
    { pending: pendingCount },
  );
}
