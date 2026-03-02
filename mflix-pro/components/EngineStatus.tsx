'use client';

/**
 * EngineStatus.tsx — Phase 4: Engine Heartbeat Indicator
 * Shows last cron run, VPS status, and system health at a glance.
 */

import React, { memo, useMemo } from 'react';
import { Activity, Server, Clock, Wifi, WifiOff, Cpu } from 'lucide-react';

interface VpsInfo {
  status: 'online' | 'down' | 'unknown';
  latencyMs?: number;
}

interface EngineStatusProps {
  lastRunAt?:    string | null;  // ISO string
  cronStatus?:   'running' | 'idle' | 'error' | null;
  timerVps?:     VpsInfo;
  hubcloudVps?:  VpsInfo;
  pendingQueue?: number;
  className?:    string;
}

function timeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const VpsChip = memo(({ label, info }: { label: string; info?: VpsInfo }) => {
  const online = info?.status === 'online';
  const unknown = !info || info.status === 'unknown';

  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${
      unknown ? 'border-slate-700 bg-slate-900/50 text-slate-500' :
      online  ? 'border-emerald-800/50 bg-emerald-950/40 text-emerald-300' :
                'border-rose-800/50 bg-rose-950/40 text-rose-300'
    }`}>
      {unknown ? (
        <Wifi className="w-3 h-3 text-slate-600" />
      ) : online ? (
        <Wifi className="w-3 h-3 text-emerald-400" />
      ) : (
        <WifiOff className="w-3 h-3 text-rose-400" />
      )}
      <span>{label}</span>
      {info?.latencyMs != null && online && (
        <span className="text-emerald-500/70">{info.latencyMs}ms</span>
      )}
    </div>
  );
});

VpsChip.displayName = 'VpsChip';

const EngineStatus = memo(function EngineStatus({
  lastRunAt,
  cronStatus,
  timerVps,
  hubcloudVps,
  pendingQueue = 0,
  className = '',
}: EngineStatusProps) {
  const isHealthy = useMemo(() => {
    if (!lastRunAt) return false;
    const minsAgo = (Date.now() - new Date(lastRunAt).getTime()) / 60_000;
    return minsAgo < 15; // Cron should run every 5 min — 15 min threshold
  }, [lastRunAt]);

  const statusDot = cronStatus === 'running' ? 'bg-emerald-400 animate-pulse' :
                    cronStatus === 'error'   ? 'bg-rose-400 animate-pulse'    :
                    isHealthy               ? 'bg-emerald-400'                :
                    lastRunAt               ? 'bg-yellow-400'                 :
                                             'bg-slate-600';

  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      {/* Cron Status */}
      <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-800/50 rounded-xl px-3 py-2">
        <div className={`w-2 h-2 rounded-full ${statusDot}`} />
        <Cpu className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-xs text-slate-300 font-medium">Engine</span>
        {lastRunAt ? (
          <span className="text-[10px] text-slate-500 ml-1">
            <Clock className="w-3 h-3 inline mr-0.5" />
            {timeAgo(lastRunAt)}
          </span>
        ) : (
          <span className="text-[10px] text-slate-600">not started</span>
        )}
      </div>

      {/* VPS Status chips */}
      <VpsChip label="Timer VPS"    info={timerVps} />
      <VpsChip label="HubCloud VPS" info={hubcloudVps} />

      {/* Pending Queue indicator */}
      {pendingQueue > 0 && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-indigo-800/40 bg-indigo-950/30 text-indigo-300 text-xs font-medium">
          <Activity className="w-3 h-3 text-indigo-400" />
          <span>{pendingQueue} pending</span>
        </div>
      )}
    </div>
  );
});

export default EngineStatus;
