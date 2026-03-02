'use client';

/**
 * AnalyticsDashboard.tsx — Phase 4: Analytics Dashboard
 * 7-day trends, solver breakdown, queue pipeline visualization.
 * Uses Recharts for graphs.
 */

import React, { memo, useState, useEffect, useCallback } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, AreaChart, Area,
} from 'recharts';
import {
  BarChart2, RefreshCw, TrendingUp, TrendingDown, Minus,
  Zap, Database, Server, AlertTriangle, Clock,
} from 'lucide-react';
import SolverHealthMatrix from './SolverHealthMatrix';

// ─── Types ────────────────────────────────────────────────────────────────────
interface AnalyticsDay {
  date:               string;
  totalProcessed:     number;
  totalSuccess:       number;
  totalFailed:        number;
  successRate:        number;
  avgProcessingTimeMs: number;
  cacheHits:          number;
  cacheHitRate:       number;
  solverBreakdown:    Record<string, { success?: number; fail?: number; totalTimeMs?: number }>;
  topErrors:          Array<{ message: string; count: number }>;
}

interface QueueStats {
  movies:    { pending: number; processing: number; completed: number; failed: number };
  webseries: { pending: number; processing: number; completed: number; failed: number };
}

interface HealthMatrix {
  vps?: {
    timer?:    { status: string; latencyMs?: number };
    hubcloud?: { status: string; latencyMs?: number };
  };
  solverBreakdown?: Record<string, { success?: number; fail?: number; totalTimeMs?: number }>;
  successRate?: number;
  actions?: string[];
  lastHealRun?: string;
}

interface AnalyticsDashboardProps {
  className?: string;
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
const StatCard = memo(({ label, value, sub, color = 'indigo', icon: Icon }: {
  label: string; value: string | number; sub?: string;
  color?: string; icon?: React.ElementType;
}) => (
  <div className={`bg-${color}-950/30 border border-${color}-800/20 rounded-xl p-4`}>
    <div className="flex items-center justify-between mb-1">
      <p className={`text-xs text-${color}-400 font-medium uppercase tracking-wider`}>{label}</p>
      {Icon && <Icon className={`w-4 h-4 text-${color}-500`} />}
    </div>
    <p className={`text-2xl font-bold text-${color}-200`}>{value}</p>
    {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
  </div>
));
StatCard.displayName = 'StatCard';

// ─── Queue Pipeline Viz ───────────────────────────────────────────────────────
const QueuePipeline = memo(({ queue }: { queue: QueueStats | null }) => {
  if (!queue) return null;
  const total = {
    pending:    queue.movies.pending    + queue.webseries.pending,
    processing: queue.movies.processing + queue.webseries.processing,
    completed:  queue.movies.completed  + queue.webseries.completed,
    failed:     queue.movies.failed     + queue.webseries.failed,
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {[
        { label: 'Pending',    count: total.pending,    color: 'text-indigo-300 bg-indigo-950/40 border-indigo-800/30' },
        { label: 'Processing', count: total.processing, color: 'text-yellow-300 bg-yellow-950/40 border-yellow-800/30' },
        { label: 'Done',       count: total.completed,  color: 'text-emerald-300 bg-emerald-950/40 border-emerald-800/30' },
        { label: 'Failed',     count: total.failed,     color: 'text-rose-300 bg-rose-950/40 border-rose-800/30' },
      ].map(({ label, count, color }, i) => (
        <React.Fragment key={label}>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${color}`}>
            <span className="text-sm font-bold">{count}</span>
            <span className="text-xs">{label}</span>
          </div>
          {i < 3 && <span className="text-slate-600 text-lg">→</span>}
        </React.Fragment>
      ))}
    </div>
  );
});
QueuePipeline.displayName = 'QueuePipeline';

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 border border-slate-700/50 rounded-lg p-3 text-xs shadow-xl">
      <p className="text-slate-300 font-medium mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="mt-0.5">
          {p.name}: <span className="font-bold">{typeof p.value === 'number' ? p.value.toFixed(0) : p.value}</span>
          {p.name.includes('Rate') ? '%' : ''}
        </p>
      ))}
    </div>
  );
};

// ─── Main Dashboard ───────────────────────────────────────────────────────────
const AnalyticsDashboard = memo(function AnalyticsDashboard({ className = '' }: AnalyticsDashboardProps) {
  const [loading,  setLoading]  = useState(true);
  const [range,    setRange]    = useState<AnalyticsDay[]>([]);
  const [today,    setToday]    = useState<AnalyticsDay | null>(null);
  const [queue,    setQueue]    = useState<QueueStats | null>(null);
  const [matrix,   setMatrix]   = useState<HealthMatrix | null>(null);
  const [error,    setError]    = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rangeRes, todayRes] = await Promise.all([
        fetch('/api/analytics?days=7'),
        fetch('/api/analytics?today=true'),
      ]);

      if (!rangeRes.ok) throw new Error('Analytics API error');
      const rangeData = await rangeRes.json();
      const todayData = await todayRes.json();

      setRange(rangeData.range ?? []);
      setQueue(rangeData.queue ?? null);
      setMatrix(rangeData.healthMatrix ?? null);
      setToday(todayData.today ?? null);
      setLastFetch(new Date());
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Format date label for chart
  const chartData = range.map(d => ({
    ...d,
    date: d.date.slice(5), // 'MM-DD'
    'Success Rate': d.successRate,
    'Processed':    d.totalProcessed,
    'Failed':       d.totalFailed,
    'Cache Rate':   d.cacheHitRate,
    'Avg Time (s)': Math.round(d.avgProcessingTimeMs / 1000),
  }));

  // Today stats
  const todaySuccessRate = today?.successRate ?? 0;
  const trendIcon = todaySuccessRate >= 80
    ? <TrendingUp   className="w-4 h-4 text-emerald-400 inline" />
    : todaySuccessRate >= 50
    ? <Minus        className="w-4 h-4 text-yellow-400 inline" />
    : <TrendingDown className="w-4 h-4 text-rose-400 inline" />;

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-indigo-400" />
          <h2 className="text-sm font-semibold text-white">Analytics Dashboard</h2>
          {lastFetch && (
            <span className="text-[10px] text-slate-600">
              Updated {Math.round((Date.now() - lastFetch.getTime()) / 60_000)}m ago
            </span>
          )}
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/60 border border-slate-700/40 rounded-lg text-xs text-slate-400 hover:text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-rose-950/30 border border-rose-800/30 rounded-xl">
          <AlertTriangle className="w-4 h-4 text-rose-400" />
          <p className="text-xs text-rose-300">{error}</p>
        </div>
      )}

      {/* Today's Stats */}
      {today && (
        <div>
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-3">Today's Overview</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              label="Processed"
              value={today.totalProcessed}
              sub={`${today.totalSuccess} success`}
              color="indigo"
              icon={BarChart2}
            />
            <StatCard
              label="Success Rate"
              value={`${todaySuccessRate}%`}
              sub={<span>{trendIcon}</span> as any}
              color={todaySuccessRate >= 80 ? 'emerald' : todaySuccessRate >= 50 ? 'yellow' : 'rose'}
              icon={TrendingUp}
            />
            <StatCard
              label="Cache Hits"
              value={`${today.cacheHitRate}%`}
              sub={`${today.cacheHits} hits`}
              color="violet"
              icon={Zap}
            />
            <StatCard
              label="Avg Time"
              value={`${Math.round(today.avgProcessingTimeMs / 1000)}s`}
              sub="per movie"
              color="slate"
              icon={Clock}
            />
          </div>
        </div>
      )}

      {/* Queue Pipeline */}
      {queue && (
        <div>
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-3">Queue Pipeline</p>
          <QueuePipeline queue={queue} />
        </div>
      )}

      {/* 7-Day Trend Chart */}
      {chartData.length > 1 && (
        <div>
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-3">7-Day Trend</p>

          <div className="bg-slate-900/40 border border-slate-800/40 rounded-xl p-4">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="successGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}   />
                  </linearGradient>
                  <linearGradient id="processedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}   />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date"        tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: '11px', color: '#94a3b8' }} />
                <Area type="monotone" dataKey="Processed"    stroke="#6366f1" fill="url(#processedGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="Success Rate" stroke="#10b981" fill="url(#successGrad)"   strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Cache + Time chart */}
          <div className="bg-slate-900/40 border border-slate-800/40 rounded-xl p-4 mt-3">
            <p className="text-[10px] text-slate-600 mb-2">Cache Hit Rate % &amp; Avg Processing Time (s)</p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date"        tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: '11px', color: '#94a3b8' }} />
                <Bar dataKey="Cache Rate"   fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Avg Time (s)" fill="#f59e0b" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Solver Health Matrix */}
      {(matrix?.solverBreakdown && Object.keys(matrix.solverBreakdown).length > 0) && (
        <div>
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-3">Solver Health Matrix</p>
          <div className="bg-slate-900/40 border border-slate-800/40 rounded-xl overflow-hidden">
            <SolverHealthMatrix
              solverBreakdown={matrix.solverBreakdown}
              vpsStatus={matrix.vps as any}
            />
          </div>
        </div>
      )}

      {/* Recent Auto-Heal Actions */}
      {matrix?.actions && matrix.actions.length > 0 && (
        <div>
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-2">Last Heal Run</p>
          <div className="bg-slate-900/30 border border-slate-800/30 rounded-xl p-3 space-y-1">
            {matrix.lastHealRun && (
              <p className="text-[10px] text-slate-600 mb-2">
                <Clock className="w-3 h-3 inline mr-1" />
                {new Date(matrix.lastHealRun).toLocaleString()}
              </p>
            )}
            {matrix.actions.map((action, i) => (
              <p key={i} className="text-xs text-slate-400 flex items-start gap-1.5">
                <span className="text-emerald-500 mt-0.5">•</span>
                {action}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Top Errors */}
      {today?.topErrors && today.topErrors.length > 0 && (
        <div>
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-3">Top Errors Today</p>
          <div className="space-y-1.5">
            {today.topErrors.slice(0, 5).map((err, i) => {
              const maxCount = today.topErrors[0]?.count ?? 1;
              const pct = Math.round((err.count / maxCount) * 100);
              return (
                <div key={i} className="flex items-center gap-3 p-2.5 bg-rose-950/20 border border-rose-800/20 rounded-lg">
                  <span className="text-xs text-rose-300 font-bold w-6 flex-shrink-0">×{err.count}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-rose-300 truncate">{err.message}</p>
                    <div className="w-full bg-rose-950/40 rounded-full h-1 mt-1">
                      <div className="h-full bg-rose-500/60 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});

export default AnalyticsDashboard;
