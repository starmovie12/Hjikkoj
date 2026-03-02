'use client';

/**
 * QueueDashboard.tsx — Phase 4: Queue Management Component
 * Auto-Pilot section — queue items list, status, controls.
 */

import React, { memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play, Pause, RefreshCw, Trash2, Clock, CheckCircle2,
  XCircle, Loader2, List, AlertCircle, Film, Tv,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface QueueItem {
  id:          string;
  url:         string;
  collection:  string;
  status:      'pending' | 'processing' | 'completed' | 'failed';
  retryCount?: number;
  priority?:   number;
  createdAt?:  string;
  taskId?:     string;
}

interface QueueState {
  pendingItems:    QueueItem[];
  isRunning:       boolean;
  isPaused:        boolean;
  currentItemId?:  string | null;
  logs:            string[];
}

interface QueueDashboardProps {
  state:           QueueState;
  onStart:         () => void;
  onPause:         () => void;
  onStop:          () => void;
  onRefresh:       () => void;
  onRemoveItem?:   (id: string, collection: string) => void;
  isLoadingQueue?: boolean;
}

// ─── Single Queue Item Row ────────────────────────────────────────────────────
const QueueItemRow = memo(function QueueItemRow({
  item,
  isActive,
  onRemove,
}: {
  item:     QueueItem;
  isActive: boolean;
  onRemove?: () => void;
}) {
  const hostname = (() => {
    try { return new URL(item.url).hostname; } catch { return item.url.substring(0, 30); }
  })();

  const statusIcon = isActive
    ? <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
    : item.status === 'completed'
    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
    : item.status === 'failed'
    ? <XCircle className="w-3.5 h-3.5 text-rose-400" />
    : <Clock className="w-3.5 h-3.5 text-slate-500" />;

  const isMovie     = item.collection === 'movies_queue';
  const priorityColors: Record<number, string> = {
    1: 'text-rose-400',   2: 'text-orange-400',
    3: 'text-slate-500',  4: 'text-slate-600',
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all ${
        isActive
          ? 'bg-indigo-950/30 border-indigo-700/30'
          : 'bg-slate-900/30 border-slate-800/30 hover:border-slate-700/50'
      }`}
    >
      {statusIcon}

      {/* Type icon */}
      {isMovie
        ? <Film className="w-3 h-3 text-slate-600 flex-shrink-0" />
        : <Tv   className="w-3 h-3 text-slate-600 flex-shrink-0" />
      }

      {/* URL */}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-300 truncate">{hostname}</p>
        <p className="text-[10px] text-slate-600 truncate">{item.url}</p>
      </div>

      {/* Priority */}
      {item.priority != null && (
        <span className={`text-[10px] font-mono ${priorityColors[item.priority] ?? 'text-slate-600'}`}>
          P{item.priority}
        </span>
      )}

      {/* Retry count */}
      {(item.retryCount ?? 0) > 0 && (
        <span className="text-[10px] text-yellow-500/70">
          ×{item.retryCount}
        </span>
      )}

      {/* Remove button (only for pending, non-active) */}
      {!isActive && item.status === 'pending' && onRemove && (
        <button
          onClick={onRemove}
          className="p-1 rounded text-slate-600 hover:text-rose-400 transition-colors"
          title="Remove from queue"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </motion.div>
  );
});

// ─── Auto-Pilot Log ───────────────────────────────────────────────────────────
const LogLine = memo(({ log }: { log: string }) => {
  const isError   = log.includes('❌') || log.toLowerCase().includes('error') || log.toLowerCase().includes('fail');
  const isSuccess = log.includes('✅') || log.toLowerCase().includes('done') || log.toLowerCase().includes('success');
  const isWarn    = log.includes('⚠️') || log.includes('🔄');

  return (
    <div className={`text-[11px] font-mono leading-relaxed ${
      isError   ? 'text-rose-400'    :
      isSuccess ? 'text-emerald-400' :
      isWarn    ? 'text-yellow-400'  :
      'text-slate-500'
    }`}>
      {log}
    </div>
  );
});
LogLine.displayName = 'LogLine';

// ─── Main Component ───────────────────────────────────────────────────────────
const QueueDashboard = memo(function QueueDashboard({
  state,
  onStart,
  onPause,
  onStop,
  onRefresh,
  onRemoveItem,
  isLoadingQueue = false,
}: QueueDashboardProps) {
  const { pendingItems, isRunning, isPaused, currentItemId, logs } = state;
  const pending   = pendingItems.filter(i => i.status === 'pending').length;
  const completed = pendingItems.filter(i => i.status === 'completed').length;
  const failed    = pendingItems.filter(i => i.status === 'failed').length;

  return (
    <div className="space-y-4">
      {/* Controls Row */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Start/Pause button */}
        {!isRunning ? (
          <button
            onClick={onStart}
            disabled={pendingItems.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-semibold text-sm rounded-xl transition-all"
          >
            <Play className="w-4 h-4" />
            Start Auto-Pilot
          </button>
        ) : isPaused ? (
          <button
            onClick={onStart}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm rounded-xl transition-all"
          >
            <Play className="w-4 h-4" />
            Resume
          </button>
        ) : (
          <button
            onClick={onPause}
            className="flex items-center gap-2 px-5 py-2.5 bg-yellow-600/80 hover:bg-yellow-500/80 text-white font-semibold text-sm rounded-xl transition-all"
          >
            <Pause className="w-4 h-4" />
            Pause
          </button>
        )}

        {isRunning && (
          <button
            onClick={onStop}
            className="flex items-center gap-2 px-4 py-2.5 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-600/30 text-rose-300 text-sm rounded-xl transition-all"
          >
            <XCircle className="w-4 h-4" />
            Stop
          </button>
        )}

        {/* Refresh */}
        <button
          onClick={onRefresh}
          disabled={isLoadingQueue}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/40 text-slate-300 text-sm rounded-xl transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isLoadingQueue ? 'animate-spin' : ''}`} />
          Refresh
        </button>

        {/* Queue counts */}
        <div className="ml-auto flex items-center gap-3 text-xs">
          <span className="text-indigo-400">{pending} pending</span>
          <span className="text-emerald-400">{completed} done</span>
          {failed > 0 && <span className="text-rose-400">{failed} failed</span>}
        </div>
      </div>

      {/* Running Status */}
      {isRunning && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-indigo-950/30 border border-indigo-700/20 rounded-xl">
          <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
          <span className="text-xs text-indigo-300">
            Auto-Pilot {isPaused ? 'paused' : 'running'}
            {currentItemId && !isPaused && ' — processing item…'}
          </span>
          <div className="ml-auto w-2 h-2 bg-indigo-400 rounded-full animate-pulse" />
        </div>
      )}

      {/* Queue Items List */}
      <div className="space-y-1.5">
        {pendingItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-slate-600">
            <List className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">Queue empty hai</p>
            <p className="text-xs text-slate-700 mt-1">URLs add karo ya bulk import karo</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {pendingItems.map(item => (
              <QueueItemRow
                key={item.id}
                item={item}
                isActive={item.id === currentItemId}
                onRemove={onRemoveItem
                  ? () => onRemoveItem(item.id, item.collection)
                  : undefined
                }
              />
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Auto-Pilot Logs */}
      {logs.length > 0 && (
        <div className="bg-slate-950/60 border border-slate-800/40 rounded-xl p-3 max-h-40 overflow-y-auto space-y-0.5">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Auto-Pilot Log</span>
          </div>
          {logs.slice(-30).map((log, i) => (
            <LogLine key={i} log={log} />
          ))}
        </div>
      )}
    </div>
  );
});

export default QueueDashboard;
