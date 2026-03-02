/**
 * lib/errorClassifier.ts — Phase 4: Error Classification Engine
 *
 * Har error ko classify karta hai + fix suggestion deta hai.
 * Yeh module auto-heal system aur AI diagnostics dono use karte hain.
 */

// ─── Error Categories ─────────────────────────────────────────────────────────
export enum ErrorCategory {
  VPS_DOWN       = 'vps_down',
  VPS_TIMEOUT    = 'vps_timeout',
  SOLVER_FAILED  = 'solver_failed',
  SOURCE_CHANGED = 'source_changed',
  NETWORK        = 'network',
  FIREBASE       = 'firebase',
  VERCEL_TIMEOUT = 'vercel_timeout',
  RATE_LIMITED   = 'rate_limited',
  CACHE_ERROR    = 'cache_error',
  AUTH_ERROR     = 'auth_error',
  NOT_FOUND      = 'not_found',
  UNKNOWN        = 'unknown',
}

export interface ClassifiedError {
  category: ErrorCategory;
  severity: 'low' | 'medium' | 'high' | 'critical';
  fixSuggestion: string;
  autoFixable: boolean;
  retryAfterMs?: number;
  emoji: string;
}

// ─── Error Classification Rules ──────────────────────────────────────────────
const ERROR_RULES: Array<{
  match: (err: string) => boolean;
  result: ClassifiedError;
}> = [
  // VPS Down
  {
    match: (e) => e.includes('ECONNREFUSED') || e.includes('ENOTFOUND') || e.includes('connection refused'),
    result: {
      category: ErrorCategory.VPS_DOWN,
      severity: 'critical',
      fixSuggestion: 'VPS restart karo: ssh root@VPS_IP "systemctl restart mflix-api mflix-timer"',
      autoFixable: false,
      emoji: '🚨',
    },
  },
  // VPS Timeout
  {
    match: (e) => e.includes('timeout') || e.includes('Timed out') || e.includes('ETIMEDOUT'),
    result: {
      category: ErrorCategory.VPS_TIMEOUT,
      severity: 'high',
      fixSuggestion: 'VPS overloaded hai — concurrent requests kam karo ya timeout badhao (AXIOS_TIMEOUT_MS)',
      autoFixable: true,
      retryAfterMs: 120_000, // retry after 2 min
      emoji: '⏱️',
    },
  },
  // Vercel 60s timeout
  {
    match: (e) => e.includes('Function execution timed out') || e.includes('FUNCTION_INVOCATION_TIMEOUT'),
    result: {
      category: ErrorCategory.VERCEL_TIMEOUT,
      severity: 'high',
      fixSuggestion: 'Task bahut bada hai — links ko smaller batches mein split karo',
      autoFixable: true,
      retryAfterMs: 0,
      emoji: '⏰',
    },
  },
  // Source website changed
  {
    match: (e) => e.includes('No solver matched') || e.includes('No links found') || e.includes('selectors'),
    result: {
      category: ErrorCategory.SOURCE_CHANGED,
      severity: 'medium',
      fixSuggestion: 'Source website ne structure change kiya — lib/solvers.ts mein CSS selectors update karo',
      autoFixable: false,
      emoji: '🔧',
    },
  },
  // Rate limited
  {
    match: (e) => e.includes('429') || e.includes('Too Many Requests') || e.includes('rate limit'),
    result: {
      category: ErrorCategory.RATE_LIMITED,
      severity: 'medium',
      fixSuggestion: '2-5 minute wait karo. Concurrent requests kam karo.',
      autoFixable: true,
      retryAfterMs: 300_000,
      emoji: '🚦',
    },
  },
  // Server errors (5xx)
  {
    match: (e) => /status code 5\d\d/.test(e) || e.includes('Internal Server Error') || e.includes('Bad Gateway'),
    result: {
      category: ErrorCategory.SOLVER_FAILED,
      severity: 'medium',
      fixSuggestion: 'External server error — auto-retry 5 min baad hoga',
      autoFixable: true,
      retryAfterMs: 300_000,
      emoji: '⚠️',
    },
  },
  // Firebase errors
  {
    match: (e) => e.includes('FIRESTORE') || e.includes('firebase') || e.includes('Firestore'),
    result: {
      category: ErrorCategory.FIREBASE,
      severity: 'high',
      fixSuggestion: 'Firebase connection issue. Credentials check karo aur Firebase status page dekho.',
      autoFixable: false,
      emoji: '🔥',
    },
  },
  // Auth errors
  {
    match: (e) => e.includes('401') || e.includes('403') || e.includes('Unauthorized') || e.includes('Forbidden'),
    result: {
      category: ErrorCategory.AUTH_ERROR,
      severity: 'medium',
      fixSuggestion: 'API key ya token expired/invalid. Credentials refresh karo.',
      autoFixable: false,
      emoji: '🔐',
    },
  },
  // Not found
  {
    match: (e) => e.includes('404') || e.includes('Not Found') || e.includes('not exist'),
    result: {
      category: ErrorCategory.NOT_FOUND,
      severity: 'low',
      fixSuggestion: 'Resource exist nahi karta. URL check karo — movie page delete ho gayi?',
      autoFixable: false,
      emoji: '🔍',
    },
  },
  // Network
  {
    match: (e) => e.includes('Network Error') || e.includes('ENETUNREACH') || e.includes('socket'),
    result: {
      category: ErrorCategory.NETWORK,
      severity: 'medium',
      fixSuggestion: 'Network connectivity issue. VPS internet check karo.',
      autoFixable: true,
      retryAfterMs: 60_000,
      emoji: '🌐',
    },
  },
];

// ─── Main Classification Function ─────────────────────────────────────────────
export function classifyError(errorMessage: string): ClassifiedError {
  const lower = errorMessage.toLowerCase();

  for (const rule of ERROR_RULES) {
    if (rule.match(lower)) {
      return rule.result;
    }
  }

  // Unknown error fallback
  return {
    category: ErrorCategory.UNKNOWN,
    severity: 'low',
    fixSuggestion: 'Unknown error. Logs check karo aur manual review karo.',
    autoFixable: false,
    emoji: '❓',
  };
}

// ─── Batch Classification ──────────────────────────────────────────────────────
export function classifyErrorBatch(errors: string[]): {
  categories: Record<ErrorCategory, number>;
  topCategory: ErrorCategory;
  criticalCount: number;
} {
  const categories: Record<ErrorCategory, number> = {} as Record<ErrorCategory, number>;
  let criticalCount = 0;

  for (const err of errors) {
    const classified = classifyError(err);
    categories[classified.category] = (categories[classified.category] || 0) + 1;
    if (classified.severity === 'critical') criticalCount++;
  }

  const topCategory = (Object.entries(categories).sort((a, b) => b[1] - a[1])[0]?.[0] as ErrorCategory)
    ?? ErrorCategory.UNKNOWN;

  return { categories, topCategory, criticalCount };
}

// ─── Error Report Formatter ───────────────────────────────────────────────────
export function formatErrorReport(errors: string[]): string {
  if (errors.length === 0) return '✅ No errors found';

  const { categories, topCategory, criticalCount } = classifyErrorBatch(errors);

  const lines: string[] = [
    `📊 Error Analysis (${errors.length} total):`,
    ...(criticalCount > 0 ? [`🚨 Critical: ${criticalCount}` ] : []),
    '',
    ...Object.entries(categories).map(([cat, count]) => `  • ${cat}: ${count}`),
    '',
    `Top Issue: ${topCategory}`,
  ];

  const topClassified = classifyError(errors[0] ?? '');
  lines.push(`💡 Fix: ${topClassified.fixSuggestion}`);

  return lines.join('\n');
}
