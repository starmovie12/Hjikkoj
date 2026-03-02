'use client';

/**
 * TaskView.tsx — Phase 4: Active Task Display Component
 *
 * Current task progress + link cards display.
 * SSE se real-time updates support karta hai.
 * Polling fallback bhi hai agar SSE fail ho.
 */

import React, { memo, useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Loader2, CheckCircle2, XCircle, Film, Globe,
  Clock, Zap, Database,
} from 'lucide-react';
import LinkCard from './LinkCard';

// ─── Types ────────────────────────────────────────────────────────────────────
interface LogEntry  { msg: string; type: 'info' | 'success' | 'error' | 'warn' }
interface LinkItem  {
  id:        number;
  name:      string;
  link:      string;
  status:    'pending' | 'processing' | 'done' | 'error';
  finalLink?: string | null;
  logs?:     LogEntry[];
  solvedBy?: string;
}
interface TaskPreview { title: string; posterUrl?: string | null }
interface TaskMeta    { quality: string; languages: string; audioLabel: string }

interface TaskData {
  id:        string;
  url:       string;
  status:    'pending' | 'processing' | 'completed' | 'failed';
  links?:    LinkItem[];
  preview?:  TaskPreview;
  metadata?: TaskMeta;
  totalLinks?:           number;
  completedLinksCount?:  number;
  updatedAt?:            string;
}

interface TaskViewProps {
  task:             TaskData;
  liveStatuses?:    Record<number, string>;
  liveLogs?:        Record<number, LogEntry[]>;
  liveLinks?:       Record<number, string | null>;
  isStreaming?:     boolean;
  useSSE?:          boolean;           // Phase 4: SSE mode
  onTaskUpdated?:   (task: TaskData) => void;
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────
const ProgressBar = memo(({ done, total }: { done: number; total: number }) => {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="w-full bg-slate-800/60 rounded-full h-1.5 overflow-hidden">
      <motion.div
        className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full"
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ ease: 'easeOut', duration: 0.4 }}
      />
    </div>
  );
});
ProgressBar.displayName = 'ProgressBar';

// ─── Status Icon ──────────────────────────────────────────────────────────────
const StatusIcon = memo(({ status }: { status: string }) => {
  if (status === 'processing' || status === 'pending') {
    return <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />;
  }
  if (status === 'completed') return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
  if (status === 'failed')    return <XCircle className="w-4 h-4 text-rose-400" />;
  return null;
});
StatusIcon.displayName = 'StatusIcon';

// ─── SSE Hook ─────────────────────────────────────────────────────────────────
function useSSEUpdates(
  taskId: string,
  enabled: boolean,
  onUpdate: (data: Partial<TaskData>) => void,
) {
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled || !taskId) return;

    function connect() {
      if (esRef.current) {
        esRef.current.close();
      }

      const es = new EventSource(`/api/events/${taskId}`);
      esRef.current = es;

      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          onUpdate(data);
        } catch { /* ignore parse errors */ }
      };

      es.addEventListener('reconnect', () => {
        // Server asking to reconnect (approaching 60s limit)
        setTimeout(connect, 500);
      });

      es.addEventListener('done', () => {
        es.close();
      });

      es.onerror = () => {
        es.close();
        // Retry after 3s
        setTimeout(connect, 3_000);
      };
    }

    connect();

    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
  }, [taskId, enabled, onUpdate]);
}

// ─── Main Component ───────────────────────────────────────────────────────────
const TaskView = memo(function TaskView({
  task: initialTask,
  liveStatuses = {},
  liveLogs     = {},
  liveLinks    = {},
  isStreaming  = false,
  useSSE       = true,
  onTaskUpdated,
}: TaskViewProps) {
  const [task, setTask] = useState<TaskData>(initialTask);

  // Sync prop changes
  useEffect(() => {
    setTask(initialTask);
  }, [initialTask]);

  // SSE real-time updates (Phase 4)
  const isTerminal = task.status === 'completed' || task.status === 'failed';
  const sseEnabled = useSSE && !isStreaming && !isTerminal;

  useSSEUpdates(task.id, sseEnabled, useCallback((data) => {
    setTask(prev => {
      const updated = { ...prev, ...data };
      onTaskUpdated?.(updated);
      return updated;
    });
  }, [onTaskUpdated]));

  const links          = task.links ?? [];
  const totalLinks     = task.totalLinks ?? links.length;
  const doneLinks      = task.completedLinksCount ?? links.filter(l => l.status === 'done').length;
  const failedLinks    = links.filter(l => l.status === 'error').length;
  const isActive       = task.status === 'processing' || task.status === 'pending';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="bg-[#0c0c14]/90 border border-slate-800/50 rounded-2xl overflow-hidden"
    >
      {/* Task Header */}
      <div className="px-5 py-4 border-b border-slate-800/40">
        <div className="flex items-start gap-3">
          {/* Poster */}
          {task.preview?.posterUrl ? (
            <img
              src={task.preview.posterUrl}
              alt="poster"
              className="w-12 h-16 object-cover rounded-lg border border-slate-700/40 flex-shrink-0"
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="w-12 h-16 bg-slate-800/60 border border-slate-700/30 rounded-lg flex items-center justify-center flex-shrink-0">
              <Film className="w-5 h-5 text-slate-600" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            {/* Title */}
            <h3 className="text-sm font-semibold text-white truncate">
              {task.preview?.title ?? 'Processing…'}
            </h3>

            {/* Metadata badges */}
            {task.metadata && (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {task.metadata.quality && task.metadata.quality !== 'Unknown Quality' && (
                  <span className="text-[10px] bg-indigo-900/40 border border-indigo-700/30 text-indigo-300 px-2 py-0.5 rounded-full">
                    {task.metadata.quality}
                  </span>
                )}
                {task.metadata.audioLabel && task.metadata.audioLabel !== 'Not Found' && (
                  <span className="text-[10px] bg-emerald-900/30 border border-emerald-700/30 text-emerald-300 px-2 py-0.5 rounded-full">
                    {task.metadata.audioLabel}
                  </span>
                )}
                {task.metadata.languages && task.metadata.languages !== 'Not Specified' && (
                  <span className="text-[10px] bg-slate-800/60 border border-slate-700/30 text-slate-400 px-2 py-0.5 rounded-full">
                    {task.metadata.languages}
                  </span>
                )}
              </div>
            )}

            {/* URL */}
            <div className="flex items-center gap-1 mt-1.5">
              <Globe className="w-3 h-3 text-slate-600 flex-shrink-0" />
              <span className="text-[10px] text-slate-600 truncate">{task.url}</span>
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
            <StatusIcon status={task.status} />
            <span className={`text-xs font-medium capitalize ${
              task.status === 'completed' ? 'text-emerald-400' :
              task.status === 'failed'    ? 'text-rose-400'    :
              task.status === 'processing'? 'text-indigo-400'  :
              'text-slate-400'
            }`}>
              {task.status}
            </span>
          </div>
        </div>

        {/* Progress */}
        {totalLinks > 0 && (
          <div className="mt-3 space-y-1.5">
            <ProgressBar done={doneLinks} total={totalLinks} />
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-slate-500">
                {doneLinks}/{totalLinks} links processed
                {failedLinks > 0 && <span className="text-rose-400 ml-1">({failedLinks} failed)</span>}
              </span>
              {sseEnabled && (
                <span className="flex items-center gap-1 text-indigo-400">
                  <Zap className="w-2.5 h-2.5" />
                  Live
                </span>
              )}
              {isStreaming && (
                <span className="flex items-center gap-1 text-emerald-400">
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  Streaming
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Link Cards */}
      {links.length > 0 && (
        <div className="p-4 space-y-3">
          <AnimatePresence initial={false}>
            {links.map((link, idx) => {
              // Layer priority: live stream > SSE updates > Firebase data
              const isLive       = isStreaming && liveStatuses[idx] != null;
              const effStatus    = isLive ? (liveStatuses[idx] as any)   : link.status;
              const effLogs      = isLive ? (liveLogs[idx]     ?? [])    : (link.logs ?? []);
              const effFinalLink = isLive ? (liveLinks[idx]    ?? null)  : (link.finalLink ?? null);

              return (
                <LinkCard
                  key={link.id}
                  id={link.id}
                  name={link.name}
                  link={link.link}
                  status={effStatus}
                  logs={effLogs}
                  finalLink={effFinalLink}
                />
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Empty state */}
      {links.length === 0 && (
        <div className="flex items-center justify-center py-10 text-slate-600">
          <div className="text-center">
            <Database className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Links extract ho rahi hain…</p>
          </div>
        </div>
      )}
    </motion.div>
  );
});

export default TaskView;
