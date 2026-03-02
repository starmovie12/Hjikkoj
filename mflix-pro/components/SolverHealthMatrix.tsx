'use client';

/**
 * SolverHealthMatrix.tsx — Phase 4: Solver Health Status Grid
 * Per-solver success rate, avg time, last hour stats.
 */

import React, { memo, useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus, Zap, Clock, AlertTriangle } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface SolverStats {
  success?:     number;
  fail?:        number;
  totalTimeMs?: number;
}

interface SolverHealthMatrixProps {
  solverBreakdown?: Record<string, SolverStats>;
  vpsStatus?: {
    timer?:    { status: 'online' | 'down' | 'unknown'; latencyMs?: number };
    hubcloud?: { status: 'online' | 'down' | 'unknown'; latencyMs?: number };
  };
  className?: string;
}

// ─── Solver Config ────────────────────────────────────────────────────────────
const SOLVER_META: Record<string, { label: string; emoji: string; vpsRequired?: 'timer' | 'hubcloud' }> = {
  hubcloud_native: { label: 'HubCloud Native',  emoji: '☁️',  vpsRequired: 'hubcloud' },
  hubcloud_vps:    { label: 'HubCloud VPS',      emoji: '🖥️',  vpsRequired: 'hubcloud' },
  hubdrive:        { label: 'HubDrive',           emoji: '📁' },
  hblinks:         { label: 'HBLinks',            emoji: '🔗' },
  hubcdn:          { label: 'HubCDN',             emoji: '🌐' },
  timer:           { label: 'Timer Bypass',       emoji: '⏱️',  vpsRequired: 'timer' },
  gdflix:          { label: 'GDFlix',             emoji: '🎬' },
  cache:           { label: 'Cache Hit',          emoji: '⚡' },
};

// ─── Status Dot ───────────────────────────────────────────────────────────────
function statusColor(rate: number): string {
  if (rate >= 80) return 'bg-emerald-400';
  if (rate >= 50) return 'bg-yellow-400';
  return 'bg-rose-400';
}

function statusText(rate: number): string {
  if (rate >= 80) return 'text-emerald-300';
  if (rate >= 50) return 'text-yellow-300';
  return 'text-rose-300';
}

// ─── Trend Icon ───────────────────────────────────────────────────────────────
const TrendIcon = memo(({ rate }: { rate: number }) => {
  if (rate >= 80) return <TrendingUp   className="w-3 h-3 text-emerald-400" />;
  if (rate >= 50) return <Minus        className="w-3 h-3 text-yellow-400" />;
  return               <TrendingDown className="w-3 h-3 text-rose-400" />;
});
TrendIcon.displayName = 'TrendIcon';

// ─── Single Row ───────────────────────────────────────────────────────────────
const SolverRow = memo(function SolverRow({
  solverKey,
  stats,
  vpsStatus,
}: {
  solverKey: string;
  stats:     SolverStats;
  vpsStatus?: SolverHealthMatrixProps['vpsStatus'];
}) {
  const meta    = SOLVER_META[solverKey] ?? { label: solverKey, emoji: '🔧' };
  const success = stats.success ?? 0;
  const fail    = stats.fail    ?? 0;
  const total   = success + fail;
  const rate    = total > 0 ? Math.round((success / total) * 100) : 0;
  const avgTime = total > 0 && stats.totalTimeMs
    ? Math.round(stats.totalTimeMs / total / 1000)
    : null;

  // VPS dependency status
  const vpsDown = meta.vpsRequired
    ? vpsStatus?.[meta.vpsRequired]?.status === 'down'
    : false;

  const latency = meta.vpsRequired
    ? vpsStatus?.[meta.vpsRequired]?.latencyMs
    : null;

  return (
    <tr className="border-b border-slate-800/30 hover:bg-slate-800/10 transition-colors">
      {/* Solver name */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${total === 0 ? 'bg-slate-600' : statusColor(rate)}`} />
          <span className="text-xs text-slate-300 font-medium">{meta.emoji} {meta.label}</span>
          {vpsDown && (
            <span className="text-[10px] text-rose-400 flex items-center gap-0.5">
              <AlertTriangle className="w-2.5 h-2.5" /> VPS Down
            </span>
          )}
        </div>
      </td>

      {/* Success % */}
      <td className="px-3 py-3 text-center">
        {total === 0 ? (
          <span className="text-[10px] text-slate-600">No data</span>
        ) : (
          <div className="flex items-center justify-center gap-1">
            <TrendIcon rate={rate} />
            <span className={`text-sm font-bold ${statusText(rate)}`}>{rate}%</span>
          </div>
        )}
      </td>

      {/* Success / Fail counts */}
      <td className="px-3 py-3 text-center">
        <span className="text-xs text-emerald-400">{success}</span>
        <span className="text-slate-600 mx-1">/</span>
        <span className="text-xs text-rose-400">{fail}</span>
      </td>

      {/* Avg time */}
      <td className="px-3 py-3 text-center">
        {avgTime != null ? (
          <span className="flex items-center justify-center gap-1 text-xs text-slate-400">
            <Clock className="w-3 h-3" />
            {avgTime}s
          </span>
        ) : (
          <span className="text-[10px] text-slate-600">—</span>
        )}
      </td>

      {/* VPS Latency */}
      <td className="px-3 py-3 text-center">
        {latency != null ? (
          <span className={`text-xs ${latency < 500 ? 'text-emerald-400' : latency < 2000 ? 'text-yellow-400' : 'text-rose-400'}`}>
            {latency}ms
          </span>
        ) : (
          <span className="text-[10px] text-slate-600">—</span>
        )}
      </td>
    </tr>
  );
});

// ─── Main Component ───────────────────────────────────────────────────────────
const SolverHealthMatrix = memo(function SolverHealthMatrix({
  solverBreakdown = {},
  vpsStatus,
  className = '',
}: SolverHealthMatrixProps) {
  // Sort solvers: known ones first, then by total calls desc
  const sortedSolvers = useMemo(() => {
    const knownOrder = Object.keys(SOLVER_META);
    const allKeys    = new Set([...knownOrder, ...Object.keys(solverBreakdown)]);

    return [...allKeys]
      .filter(k => solverBreakdown[k])  // only solvers with data
      .sort((a, b) => {
        const ai = knownOrder.indexOf(a);
        const bi = knownOrder.indexOf(b);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return  1;
        const at = (solverBreakdown[a]?.success ?? 0) + (solverBreakdown[a]?.fail ?? 0);
        const bt = (solverBreakdown[b]?.success ?? 0) + (solverBreakdown[b]?.fail ?? 0);
        return bt - at;
      });
  }, [solverBreakdown]);

  const totalSuccess = useMemo(() =>
    Object.values(solverBreakdown).reduce((s, v) => s + (v.success ?? 0), 0),
  [solverBreakdown]);

  const totalFail = useMemo(() =>
    Object.values(solverBreakdown).reduce((s, v) => s + (v.fail ?? 0), 0),
  [solverBreakdown]);

  const overallRate = (totalSuccess + totalFail) > 0
    ? Math.round((totalSuccess / (totalSuccess + totalFail)) * 100)
    : null;

  if (sortedSolvers.length === 0) {
    return (
      <div className={`flex items-center justify-center py-8 text-slate-600 ${className}`}>
        <div className="text-center">
          <Zap className="w-6 h-6 mx-auto mb-2 opacity-30" />
          <p className="text-xs">No solver data yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Overall rate badge */}
      {overallRate != null && (
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-3.5 h-3.5 text-yellow-400" />
          <span className="text-xs text-slate-400">Overall success:</span>
          <span className={`text-sm font-bold ${statusText(overallRate)}`}>{overallRate}%</span>
          <span className="text-xs text-slate-600">
            ({totalSuccess} done / {totalFail} failed)
          </span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700/40">
              <th className="px-4 py-2 text-left text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Solver</th>
              <th className="px-3 py-2 text-center text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Rate</th>
              <th className="px-3 py-2 text-center text-[10px] text-slate-500 uppercase tracking-wider font-semibold">✓/✗</th>
              <th className="px-3 py-2 text-center text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Avg Time</th>
              <th className="px-3 py-2 text-center text-[10px] text-slate-500 uppercase tracking-wider font-semibold">VPS Latency</th>
            </tr>
          </thead>
          <tbody>
            {sortedSolvers.map(key => (
              <SolverRow
                key={key}
                solverKey={key}
                stats={solverBreakdown[key]!}
                vpsStatus={vpsStatus}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});

export default SolverHealthMatrix;
