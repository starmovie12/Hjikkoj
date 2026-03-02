'use client';

/**
 * StatsBar.tsx — Phase 4: Top Stats Overview Bar
 * Processing, Completed, Failed, Cache Hit rate display.
 */

import React, { memo } from 'react';
import { CheckCircle2, XCircle, Loader2, Zap, Database } from 'lucide-react';

interface StatsBarProps {
  processing: number;
  completed:  number;
  failed:     number;
  cacheHits?: number;
  totalLinks?: number;
  isLoading?: boolean;
}

const StatsBar = memo(function StatsBar({
  processing,
  completed,
  failed,
  cacheHits  = 0,
  totalLinks = 0,
  isLoading  = false,
}: StatsBarProps) {
  const total       = processing + completed + failed;
  const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  const cacheRate   = totalLinks > 0 ? Math.round((cacheHits / totalLinks) * 100) : 0;

  return (
    <div className="flex flex-wrap gap-3 w-full">
      {/* Processing */}
      <div className="flex-1 min-w-[110px] flex items-center gap-2 bg-indigo-950/40 border border-indigo-800/30 rounded-xl px-4 py-2.5">
        <Loader2 className={`w-4 h-4 text-indigo-400 ${isLoading || processing > 0 ? 'animate-spin' : ''}`} />
        <div>
          <p className="text-[10px] text-indigo-400 uppercase tracking-wider font-semibold">Processing</p>
          <p className="text-lg font-bold text-indigo-200 leading-none">{processing}</p>
        </div>
      </div>

      {/* Completed */}
      <div className="flex-1 min-w-[110px] flex items-center gap-2 bg-emerald-950/40 border border-emerald-800/30 rounded-xl px-4 py-2.5">
        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        <div>
          <p className="text-[10px] text-emerald-400 uppercase tracking-wider font-semibold">Completed</p>
          <p className="text-lg font-bold text-emerald-200 leading-none">{completed}</p>
        </div>
      </div>

      {/* Failed */}
      <div className="flex-1 min-w-[110px] flex items-center gap-2 bg-rose-950/40 border border-rose-800/30 rounded-xl px-4 py-2.5">
        <XCircle className="w-4 h-4 text-rose-400" />
        <div>
          <p className="text-[10px] text-rose-400 uppercase tracking-wider font-semibold">Failed</p>
          <p className="text-lg font-bold text-rose-200 leading-none">{failed}</p>
        </div>
      </div>

      {/* Success Rate */}
      {total > 0 && (
        <div className="flex-1 min-w-[110px] flex items-center gap-2 bg-slate-900/50 border border-slate-700/30 rounded-xl px-4 py-2.5">
          <Zap className="w-4 h-4 text-yellow-400" />
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Success Rate</p>
            <p className={`text-lg font-bold leading-none ${
              successRate >= 80 ? 'text-emerald-300' :
              successRate >= 50 ? 'text-yellow-300' :
              'text-rose-300'
            }`}>{successRate}%</p>
          </div>
        </div>
      )}

      {/* Cache Hit Rate */}
      {totalLinks > 0 && (
        <div className="flex-1 min-w-[110px] flex items-center gap-2 bg-violet-950/40 border border-violet-800/30 rounded-xl px-4 py-2.5">
          <Database className="w-4 h-4 text-violet-400" />
          <div>
            <p className="text-[10px] text-violet-400 uppercase tracking-wider font-semibold">Cache Hits</p>
            <p className="text-lg font-bold text-violet-200 leading-none">
              {cacheRate}%
              <span className="text-xs text-violet-400 ml-1 font-normal">({cacheHits})</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
});

export default StatsBar;
