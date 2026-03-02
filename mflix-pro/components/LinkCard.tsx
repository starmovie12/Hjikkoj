'use client';
import { Clock, Loader2, CheckCircle2, XCircle, Copy, Check, ExternalLink } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface LogEntry {
  msg: string;
  type: 'info' | 'success' | 'error' | 'warn';
}

interface LinkCardProps {
  id: number;
  name: string;
  logs: LogEntry[];
  finalLink: string | null;
  status: 'pending' | 'processing' | 'done' | 'error';
  link?: string;
}

function getDomainBadge(linkUrl: string): { label: string; color: string } {
  if (!linkUrl) return { label: 'Direct', color: 'text-zinc-400' };
  const url = linkUrl.toLowerCase();
  if (url.includes('hubcloud'))    return { label: 'HubCloud',  color: 'text-sky-400' };
  if (url.includes('hubdrive'))    return { label: 'HubDrive',  color: 'text-violet-400' };
  if (url.includes('hubcdn'))      return { label: 'HubCDN',    color: 'text-amber-400' };
  if (url.includes('hblinks'))     return { label: 'HBLinks',   color: 'text-pink-400' };
  if (url.includes('gdflix'))      return { label: 'GDFlix',    color: 'text-cyan-400' };
  if (url.includes('drivehub'))    return { label: 'DriveHub',  color: 'text-teal-400' };
  if (
    url.includes('gadgetsweb') ||
    url.includes('review-tech') ||
    url.includes('ngwin') ||
    url.includes('cryptoinsights')
  ) return { label: 'Timer', color: 'text-orange-400' };
  return { label: 'Direct', color: 'text-zinc-400' };
}

function getLogColor(type: string): string {
  switch (type) {
    case 'success': return 'text-emerald-400 font-semibold';
    case 'error':   return 'text-rose-400';
    case 'warn':    return 'text-amber-400';
    case 'info':    return 'text-sky-400';
    default:        return 'text-zinc-400';
  }
}

export default function LinkCard({ id, name, logs, finalLink, status, link = '' }: LinkCardProps) {
  const [copied, setCopied] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const domainBadge = getDomainBadge(link || finalLink || '');

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollTop = logEndRef.current.scrollHeight;
    }
  }, [logs]);

  const handleCopy = async (url: string) => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    if (typeof navigator.vibrate === 'function') navigator.vibrate(50);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── PENDING ──────────────────────────────────────────────────────────────────
  if (status === 'pending') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: id * 0.05, duration: 0.3 }}
        className="relative p-4 rounded-2xl border-l-4 border-zinc-700 bg-zinc-900/50"
      >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <motion.div animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 2, repeat: Infinity }}>
              <Clock className="w-4 h-4 text-zinc-500 flex-shrink-0" />
            </motion.div>
            <span className="text-zinc-400 text-sm font-medium font-mono truncate max-w-[200px]">{name}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-[10px] font-mono ${domainBadge.color}`}>{domainBadge.label}</span>
            <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-500 text-[10px] font-semibold uppercase tracking-wider">PENDING</span>
          </div>
        </div>
        <p className="text-zinc-600 text-xs font-mono pl-6">⏳ Queued — Auto-Pilot will process this shortly</p>
      </motion.div>
    );
  }

  // ── PROCESSING ───────────────────────────────────────────────────────────────
  if (status === 'processing') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: id * 0.05, duration: 0.3 }}
        className="relative p-4 rounded-2xl border-l-4 border-indigo-500 bg-indigo-950/30 overflow-hidden"
      >
        <motion.div
          className="absolute inset-0 bg-indigo-500/5 rounded-2xl pointer-events-none"
          animate={{ opacity: [0, 0.4, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div className="flex items-center justify-between mb-2 relative">
          <div className="flex items-center gap-2">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
              <Loader2 className="w-4 h-4 text-indigo-400 flex-shrink-0" />
            </motion.div>
            <span className="text-indigo-300 text-sm font-medium font-mono truncate max-w-[200px]">{name}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-[10px] font-mono ${domainBadge.color}`}>{domainBadge.label}</span>
            <span className="px-2 py-0.5 rounded-full bg-indigo-900/50 text-indigo-400 text-[10px] font-semibold uppercase tracking-wider">EXTRACTING...</span>
          </div>
        </div>
        {logs.length > 0 ? (
          <div ref={logEndRef} className="relative bg-black/60 p-3 rounded-xl font-mono text-[11px] max-h-[120px] overflow-y-auto space-y-0.5">
            {logs.map((log, i) => (
              <div key={i} className={`leading-relaxed ${getLogColor(log.type)}`}>
                <span className="text-zinc-600 mr-1">&gt;</span>{log.msg}
              </div>
            ))}
            <div className="text-zinc-600 animate-pulse"><span className="mr-1">&gt;</span>Solving...</div>
          </div>
        ) : (
          <div className="bg-black/60 p-3 rounded-xl font-mono text-[11px]">
            <div className="text-zinc-600 animate-pulse"><span className="mr-1">&gt;</span>Initializing solver chain...</div>
          </div>
        )}
      </motion.div>
    );
  }

  // ── DONE ─────────────────────────────────────────────────────────────────────
  if (status === 'done') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: id * 0.05, duration: 0.3, ease: 'easeOut' }}
        className="relative p-4 rounded-2xl border-l-4 border-emerald-500 bg-emerald-950/30 overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-transparent pointer-events-none" />
        <div className="flex items-center justify-between mb-3 relative">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span className="text-white font-semibold text-sm font-mono truncate max-w-[200px]">{name}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-[10px] font-mono ${domainBadge.color}`}>{domainBadge.label}</span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-900/50 text-emerald-400 text-[10px] font-semibold uppercase tracking-wider">EXTRACTED</span>
          </div>
        </div>

        {logs.length > 0 && (
          <div ref={logEndRef} className="bg-black/40 p-2 rounded-xl font-mono text-[10px] max-h-[70px] overflow-y-auto space-y-0.5 mb-3 opacity-60">
            {logs.slice(-3).map((log, i) => (
              <div key={i} className={`leading-relaxed ${getLogColor(log.type)}`}>
                <span className="text-zinc-600 mr-1">&gt;</span>{log.msg}
              </div>
            ))}
          </div>
        )}

        <AnimatePresence>
          {finalLink && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="space-y-2"
            >
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-2.5 font-mono text-xs text-emerald-300 truncate">
                {finalLink}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleCopy(finalLink)}
                  className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-emerald-900/40 border border-emerald-700/50 text-emerald-400 text-xs font-semibold hover:bg-emerald-900/70 transition-all active:scale-95"
                >
                  {copied ? <><Check className="w-3.5 h-3.5" /><span>COPIED!</span></> : <><Copy className="w-3.5 h-3.5" /><span>COPY LINK</span></>}
                </button>
                <a
                  href={finalLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-zinc-800/60 border border-zinc-700/50 text-zinc-300 text-xs font-semibold hover:bg-zinc-700/60 transition-all active:scale-95"
                >
                  <ExternalLink className="w-3.5 h-3.5" /><span>OPEN</span>
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  // ── ERROR ─────────────────────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: id * 0.05, duration: 0.3 }}
      className="relative p-4 rounded-2xl border-l-4 border-rose-500 bg-rose-950/30 overflow-hidden"
    >
      <div className="absolute inset-0 bg-gradient-to-r from-rose-500/5 to-transparent pointer-events-none" />
      <div className="flex items-center justify-between mb-2 relative">
        <div className="flex items-center gap-2">
          <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
          <span className="text-rose-300 text-sm font-medium font-mono truncate max-w-[200px]">{name}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-[10px] font-mono ${domainBadge.color}`}>{domainBadge.label}</span>
          <span className="px-2 py-0.5 rounded-full bg-rose-900/50 text-rose-400 text-[10px] font-semibold uppercase tracking-wider">FAILED</span>
        </div>
      </div>
      {logs.length > 0 && (
        <div ref={logEndRef} className="bg-black/40 p-2 rounded-xl font-mono text-[10px] max-h-[70px] overflow-y-auto space-y-0.5 opacity-70">
          {logs.slice(-3).map((log, i) => (
            <div key={i} className={`leading-relaxed ${getLogColor(log.type)}`}>
              <span className="text-zinc-600 mr-1">&gt;</span>{log.msg}
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
