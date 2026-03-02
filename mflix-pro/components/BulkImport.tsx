'use client';

/**
 * BulkImport.tsx — Phase 4: Bulk URL Import Modal
 * Textarea ya .txt file se multiple URLs ek saath add karo queue mein.
 */

import React, { useState, useCallback, useRef } from 'react';
import { X, Upload, Plus, FileText, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface BulkImportProps {
  isOpen:   boolean;
  onClose:  () => void;
  onSuccess?: (result: { added: number; skipped: number; duplicates: number }) => void;
  queueType?: 'movies' | 'webseries';
}

interface BulkResult {
  added:      number;
  skipped:    number;
  duplicates: number;
  failed?:    number;
  errors?:    string[];
}

export default function BulkImport({ isOpen, onClose, onSuccess, queueType = 'movies' }: BulkImportProps) {
  const [urlText,   setUrlText]   = useState('');
  const [loading,   setLoading]   = useState(false);
  const [result,    setResult]    = useState<BulkResult | null>(null);
  const [error,     setError]     = useState<string | null>(null);
  const [priority,  setPriority]  = useState(3);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const urlCount = urlText
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('http'))
    .length;

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      setUrlText(prev => prev ? `${prev}\n${content}` : content);
    };
    reader.readAsText(file);
  }, []);

  const handleSubmit = useCallback(async () => {
    setError(null);
    setResult(null);

    const urls = urlText
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.startsWith('http'));

    if (urls.length === 0) {
      setError('Koi valid URL nahi mili. URLs http:// se start honi chahiye.');
      return;
    }

    if (urls.length > 100) {
      setError('Maximum 100 URLs ek baar mein allowed hain.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/tasks/bulk', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ urls, priority, type: queueType }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? 'Bulk import failed');

      setResult(data);
      onSuccess?.(data);
    } catch (err: any) {
      setError(err?.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [urlText, priority, queueType, onSuccess]);

  const handleClose = useCallback(() => {
    if (loading) return;
    setUrlText('');
    setResult(null);
    setError(null);
    onClose();
  }, [loading, onClose]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="relative w-full max-w-lg bg-[#0c0c14] border border-slate-800/60 rounded-2xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-indigo-600/20 rounded-lg flex items-center justify-center">
                  <Upload className="w-4 h-4 text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white">Bulk Import</h2>
                  <p className="text-xs text-slate-500">Multiple URLs ek saath add karo</p>
                </div>
              </div>
              <button
                onClick={handleClose}
                disabled={loading}
                className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800/50 transition-colors disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              {!result ? (
                <>
                  {/* URL Textarea */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium text-slate-400">
                        Movie/Series URLs (ek line mein ek URL)
                      </label>
                      {urlCount > 0 && (
                        <span className="text-xs text-indigo-400 font-medium">{urlCount} URLs</span>
                      )}
                    </div>
                    <textarea
                      value={urlText}
                      onChange={e => setUrlText(e.target.value)}
                      placeholder={`https://hdhub4u.fo/movie1\nhttps://hdhub4u.fo/movie2\n...`}
                      rows={8}
                      className="w-full bg-slate-900/60 border border-slate-700/50 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500/60 resize-none font-mono"
                      disabled={loading}
                    />
                  </div>

                  {/* File Upload */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={loading}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-xs text-slate-300 hover:border-indigo-500/50 hover:text-white transition-all disabled:opacity-50"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      .txt File Upload
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".txt"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                    <div className="text-xs text-slate-600">ya .txt file upload karo (ek line = ek URL)</div>
                  </div>

                  {/* Priority */}
                  <div>
                    <label className="text-xs font-medium text-slate-400 block mb-2">Priority</label>
                    <div className="flex gap-2">
                      {[
                        { val: 1, label: 'Urgent',  color: 'rose' },
                        { val: 2, label: 'High',    color: 'orange' },
                        { val: 3, label: 'Normal',  color: 'indigo' },
                        { val: 4, label: 'Low',     color: 'slate' },
                      ].map(({ val, label, color }) => (
                        <button
                          key={val}
                          onClick={() => setPriority(val)}
                          className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                            priority === val
                              ? `bg-${color}-600/30 border-${color}-600/50 text-${color}-300`
                              : 'bg-slate-900/40 border-slate-700/40 text-slate-500 hover:border-slate-600'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Error */}
                  {error && (
                    <div className="flex items-start gap-2 p-3 bg-rose-950/30 border border-rose-800/30 rounded-xl">
                      <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-rose-300">{error}</p>
                    </div>
                  )}

                  {/* Submit */}
                  <button
                    onClick={handleSubmit}
                    disabled={loading || urlCount === 0}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-semibold text-sm rounded-xl transition-all"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Adding {urlCount} URLs…
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        Add {urlCount > 0 ? urlCount : ''} URLs to Queue
                      </>
                    )}
                  </button>
                </>
              ) : (
                // Success state
                <div className="text-center py-4 space-y-4">
                  <div className="w-14 h-14 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white mb-1">Import Complete!</h3>
                    <p className="text-sm text-slate-400">URLs queue mein add ho gayi hain.</p>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-emerald-950/40 border border-emerald-800/30 rounded-xl p-3">
                      <p className="text-xl font-bold text-emerald-300">{result.added}</p>
                      <p className="text-xs text-emerald-500 mt-0.5">Added</p>
                    </div>
                    <div className="bg-yellow-950/40 border border-yellow-800/30 rounded-xl p-3">
                      <p className="text-xl font-bold text-yellow-300">{result.duplicates}</p>
                      <p className="text-xs text-yellow-500 mt-0.5">Duplicates</p>
                    </div>
                    <div className="bg-slate-900/50 border border-slate-700/30 rounded-xl p-3">
                      <p className="text-xl font-bold text-slate-300">{result.skipped}</p>
                      <p className="text-xs text-slate-500 mt-0.5">Skipped</p>
                    </div>
                  </div>

                  <button
                    onClick={handleClose}
                    className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-xl transition-colors"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
