'use client';

/**
 * HistoryPanel.tsx — Phase 4: Completed Tasks History
 * Completed/failed tasks list with virtual scrolling for performance.
 * Click to expand and see links.
 */

import React, { memo, useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CheckCircle2, XCircle, ChevronDown, ChevronRight,
  Film, Globe, Clock, Copy, Check, ExternalLink,
  Search, Filter,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface LinkItem {
  id:        number;
  name:      string;
  link:      string;
  status:    string;
  finalLink?: string | null;
}

interface HistoryTask {
  id:        string;
  url:       string;
  status:    'completed' | 'failed';
  preview?:  { title?: string; posterUrl?: string | null };
  metadata?: { quality?: string; languages?: string; audioLabel?: string };
  links?:    LinkItem[];
  createdAt?: string;
  updatedAt?: string;
}

interface HistoryPanelProps {
  tasks:     HistoryTask[];
  maxShow?:  number;
}

// ─── Copy Button ──────────────────────────────────────────────────────────────
const CopyButton = memo(({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded text-slate-600 hover:text-slate-300 transition-colors"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
    </button>
  );
});
CopyButton.displayName = 'CopyButton';

// ─── Task Row ─────────────────────────────────────────────────────────────────
const TaskRow = memo(function TaskRow({ task }: { task: HistoryTask }) {
  const [expanded, setExpanded] = useState(false);

  const doneLinks   = useMemo(() => (task.links ?? []).filter(l => l.status === 'done' && l.finalLink), [task.links]);
  const failedLinks = useMemo(() => (task.links ?? []).filter(l => l.status === 'error'), [task.links]);
  const isSuccess   = task.status === 'completed';

  const hostname = useMemo(() => {
    try { return new URL(task.url).hostname; } catch { return ''; }
  }, [task.url]);

  const timeStr = useMemo(() => {
    const dateStr = task.updatedAt ?? task.createdAt;
    if (!dateStr) return '';
    try {
      const d    = new Date(dateStr);
      const now  = Date.now();
      const diff = now - d.getTime();
      const mins = Math.floor(diff / 60_000);
      if (mins < 1)  return 'just now';
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24)  return `${hrs}h ago`;
      return d.toLocaleDateString();
    } catch { return ''; }
  }, [task.updatedAt, task.createdAt]);

  return (
    <div className={`border rounded-xl overflow-hidden transition-colors ${
      isSuccess
        ? 'border-emerald-800/20 bg-emerald-950/10'
        : 'border-rose-800/20 bg-rose-950/10'
    }`}>
      {/* Row Header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
      >
        {/* Status icon */}
        {isSuccess
          ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          : <XCircle      className="w-4 h-4 text-rose-400 flex-shrink-0" />
        }

        {/* Poster */}
        {task.preview?.posterUrl ? (
          <img
            src={task.preview.posterUrl}
            alt=""
            className="w-7 h-9 object-cover rounded border border-slate-700/30 flex-shrink-0"
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <Film className="w-4 h-4 text-slate-600 flex-shrink-0" />
        )}

        {/* Title + URL */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-200 truncate">
            {task.preview?.title ?? hostname ?? task.url.substring(0, 40)}
          </p>
          <div className="flex items-center gap-3 mt-0.5">
            {task.metadata?.quality && task.metadata.quality !== 'Unknown Quality' && (
              <span className="text-[10px] text-indigo-400">{task.metadata.quality}</span>
            )}
            <span className="text-[10px] text-slate-600">{hostname}</span>
            {timeStr && (
              <span className="text-[10px] text-slate-700 flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" />{timeStr}
              </span>
            )}
          </div>
        </div>

        {/* Links count */}
        <div className="text-right flex-shrink-0">
          <p className="text-xs text-slate-400">
            {doneLinks.length}/{(task.links ?? []).length} links
          </p>
          {failedLinks.length > 0 && (
            <p className="text-[10px] text-rose-400">{failedLinks.length} failed</p>
          )}
        </div>

        {/* Chevron */}
        {expanded
          ? <ChevronDown  className="w-4 h-4 text-slate-500 flex-shrink-0" />
          : <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
        }
      </button>

      {/* Expanded: Links List */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-slate-800/30 px-4 py-3 space-y-2">
              {(task.links ?? []).length === 0 ? (
                <p className="text-xs text-slate-600 text-center py-2">No links data</p>
              ) : (
                (task.links ?? []).map(link => (
                  <div key={link.id} className={`flex items-center gap-2 p-2.5 rounded-lg ${
                    link.status === 'done'  ? 'bg-emerald-950/20' :
                    link.status === 'error' ? 'bg-rose-950/20'    :
                    'bg-slate-900/30'
                  }`}>
                    {link.status === 'done'
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                      : link.status === 'error'
                      ? <XCircle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                      : <Clock className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                    }

                    <span className="text-xs text-slate-300 flex-1 min-w-0 truncate">{link.name}</span>

                    {link.finalLink ? (
                      <>
                        <CopyButton text={link.finalLink} />
                        <a
                          href={link.finalLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 rounded text-slate-600 hover:text-indigo-400 transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </>
                    ) : link.status === 'error' ? (
                      <span className="text-[10px] text-rose-400">Failed</span>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

// ─── Main Component ───────────────────────────────────────────────────────────
const HistoryPanel = memo(function HistoryPanel({
  tasks,
  maxShow = 50,
}: HistoryPanelProps) {
  const [search, setSearch]       = useState('');
  const [filterStatus, setFilter] = useState<'all' | 'completed' | 'failed'>('all');
  const [showCount, setShowCount] = useState(20);

  const filtered = useMemo(() => {
    let list = tasks.filter(t => t.status === 'completed' || t.status === 'failed');

    if (filterStatus !== 'all') {
      list = list.filter(t => t.status === filterStatus);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.url.toLowerCase().includes(q) ||
        t.preview?.title?.toLowerCase().includes(q)
      );
    }

    return list.slice(0, Math.min(showCount, maxShow));
  }, [tasks, filterStatus, search, showCount, maxShow]);

  const total       = tasks.filter(t => t.status === 'completed' || t.status === 'failed').length;
  const completedCt = tasks.filter(t => t.status === 'completed').length;
  const failedCt    = tasks.filter(t => t.status === 'failed').length;

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by title or URL…"
            className="w-full pl-8 pr-3 py-2 bg-slate-900/60 border border-slate-700/40 rounded-xl text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500/50"
          />
        </div>

        {/* Filter buttons */}
        <div className="flex items-center gap-1.5">
          {[
            { key: 'all',       label: `All (${total})`,          color: 'slate' },
            { key: 'completed', label: `Done (${completedCt})`,   color: 'emerald' },
            { key: 'failed',    label: `Failed (${failedCt})`,    color: 'rose' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key as typeof filterStatus)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filterStatus === key
                  ? 'bg-indigo-600/30 border border-indigo-600/40 text-indigo-300'
                  : 'bg-slate-900/40 border border-slate-700/30 text-slate-500 hover:text-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Task List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-slate-600">
          <Film className="w-8 h-8 mb-2 opacity-30" />
          <p className="text-sm">{search ? 'Koi result nahi mila' : 'Koi history nahi'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {filtered.map(task => (
              <TaskRow key={task.id} task={task as HistoryTask} />
            ))}
          </AnimatePresence>

          {/* Load more */}
          {total > showCount && (
            <button
              onClick={() => setShowCount(v => Math.min(v + 20, maxShow))}
              className="w-full py-2.5 bg-slate-900/40 border border-slate-800/40 rounded-xl text-xs text-slate-500 hover:text-slate-300 hover:border-slate-700 transition-all"
            >
              Load more ({total - showCount} remaining)
            </button>
          )}
        </div>
      )}
    </div>
  );
});

export default HistoryPanel;
