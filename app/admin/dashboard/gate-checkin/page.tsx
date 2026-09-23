'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';

interface CheckinResult {
  status: 'valid' | 'duplicate' | 'invalid' | 'expired' | 'error';
  student_name?: string;
  roll_no?: string;
  ticket_id?: string;
  department?: string;
  batch?: string;
  society?: string;
  scanned_at?: string;
  scanned_by?: string;
  qr_token?: string;
  message?: string;
  was_override?: boolean;
}

interface HistoryItem {
  id: string;
  timestamp: string;
  student_name: string;
  roll_no: string;
  ticket_id: string;
  status: 'valid' | 'duplicate' | 'forced_override';
}

export default function GateCheckinPage() {
  const [ticketInput, setTicketInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [overriding, setOverriding] = useState(false);
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const playChime = (type: 'success' | 'warning' | 'error') => {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'success') {
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      } else if (type === 'warning') {
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.setValueAtTime(370, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
        osc.start();
        osc.stop(ctx.currentTime + 0.35);
      } else {
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        osc.frequency.setValueAtTime(180, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
      }
    } catch {
      // AudioContext unavailable or blocked by browser policy
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = ticketInput.trim();
    if (!query) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/scanner/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qr_token: query,
          scanned_by: 'Admin / Gate Operator',
          device_info: 'Admin Dashboard Check-in Terminal',
        }),
      });

      const data: CheckinResult = await res.json();
      setResult(data);

      if (data.status === 'valid') {
        playChime('success');
        setHistory((prev) => [
          {
            id: String(Date.now()),
            timestamp: new Date().toLocaleTimeString(),
            student_name: data.student_name || 'Student',
            roll_no: data.roll_no || query,
            ticket_id: data.ticket_id || query,
            status: 'valid',
          },
          ...prev,
        ]);
        setTicketInput('');
      } else if (data.status === 'duplicate') {
        playChime('warning');
      } else {
        playChime('error');
      }
    } catch {
      setResult({ status: 'error', message: 'Failed to verify ticket with server.' });
      playChime('error');
    } finally {
      setLoading(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  };

  const handleOverride = async () => {
    if (!result) return;
    const tokenToOverride = result.ticket_id || result.qr_token || result.roll_no;
    if (!tokenToOverride) return;

    setOverriding(true);
    try {
      const res = await fetch('/api/scanner/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qr_token: tokenToOverride,
          scanned_by: 'Admin Supervisor',
          device_info: 'Admin Dashboard Check-in Terminal [OVERRIDE]',
          override: true,
        }),
      });

      const data: CheckinResult = await res.json();
      setResult({ ...data, was_override: true });

      if (data.status === 'valid') {
        playChime('success');
        setHistory((prev) => [
          {
            id: String(Date.now()),
            timestamp: new Date().toLocaleTimeString(),
            student_name: data.student_name || 'Student',
            roll_no: data.roll_no || tokenToOverride,
            ticket_id: data.ticket_id || tokenToOverride,
            status: 'forced_override',
          },
          ...prev,
        ]);
        setTicketInput('');
      }
    } catch {
      alert('Error recording override');
    } finally {
      setOverriding(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-surface-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <span>🎟️</span> Gate Check-in Terminal
          </h1>
          <p className="text-sm text-surface-400 mt-1">
            Manual ticket entry & USB barcode scanner verification across all entrance gates.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-3.5 py-1.5 rounded-xl bg-surface-900 border border-surface-800 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold text-surface-300">Live Gate Sync</span>
          </div>
          <div className="px-3.5 py-1.5 rounded-xl bg-primary-500/10 border border-primary-500/30 text-primary-400 font-mono text-xs font-bold">
            Total Checked in: {history.length}
          </div>
        </div>
      </div>

      {/* Input Verification Bar */}
      <div className="p-6 rounded-3xl bg-surface-900/90 border border-surface-800 shadow-2xl backdrop-blur">
        <form onSubmit={handleVerify} className="space-y-3">
          <label htmlFor="ticket-search" className="block text-xs font-bold uppercase tracking-wider text-surface-300">
            Scan or Enter Ticket ID / Roll Number
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-surface-400 text-lg">
                🔍
              </span>
              <input
                id="ticket-search"
                ref={inputRef}
                type="text"
                autoComplete="off"
                className="w-full bg-surface-950 border border-surface-700 focus:border-primary-500 rounded-2xl pl-12 pr-10 py-4 text-white text-lg font-mono placeholder-surface-500 focus:outline-none focus:ring-4 focus:ring-primary-500/20 uppercase transition-all"
                placeholder="e.g. FP26-41211, 41211, or 24F-CS-001"
                value={ticketInput}
                onChange={(e) => setTicketInput(e.target.value)}
              />
              {ticketInput && (
                <button
                  type="button"
                  onClick={() => { setTicketInput(''); inputRef.current?.focus(); }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-surface-400 hover:text-white text-sm"
                >
                  ✕
                </button>
              )}
            </div>
            <Button
              type="submit"
              size="lg"
              loading={loading}
              className="py-4 px-8 text-base font-bold rounded-2xl shadow-lg shadow-primary-600/30 min-w-[140px]"
            >
              Verify Entry
            </Button>
          </div>
          <p className="text-xs text-surface-500 flex items-center gap-1.5 pt-1">
            <span>💡</span> Tip: Plug in a handheld USB barcode/QR scanner or type and hit Enter.
          </p>
        </form>
      </div>

      {/* Result Status Display */}
      {result && (
        <div className="animate-fade-in">
          {/* 1. GREEN: ENTRY ALLOWED */}
          {result.status === 'valid' && (
            <div className="rounded-3xl p-8 bg-gradient-to-br from-emerald-950/90 to-surface-900 border-2 border-emerald-500/80 shadow-2xl text-center relative overflow-hidden">
              <div className="absolute top-0 right-0 transform translate-x-8 -translate-y-8 w-40 h-40 bg-emerald-500/10 rounded-full blur-2xl" />
              <div className="text-7xl mb-3 animate-scale-in">✅</div>
              <h2 className="text-3xl font-black text-emerald-400 tracking-tight mb-1">
                ENTRY ALLOWED
              </h2>
              {result.was_override && (
                <div className="inline-block px-3 py-1 bg-amber-500 text-black font-extrabold text-xs uppercase tracking-wider rounded-full mb-3 shadow">
                  ⚠️ Forced Supervisor Override Logged
                </div>
              )}
              <h3 className="text-2xl font-bold text-white mt-2 mb-2">
                {result.student_name}
              </h3>
              <div className="flex flex-wrap items-center justify-center gap-3 my-4">
                <span className="px-4 py-1.5 rounded-xl bg-black/40 border border-white/20 font-mono text-base text-surface-200">
                  Roll: <strong className="text-white">{result.roll_no}</strong>
                </span>
                {result.ticket_id && (
                  <span className="px-4 py-1.5 rounded-xl bg-emerald-500 text-black font-mono font-bold text-base shadow">
                    🎟️ Ticket ID: {result.ticket_id}
                  </span>
                )}
              </div>
              <p className="text-sm text-surface-300">
                Department: <strong className="text-white">{result.department || 'N/A'}</strong> · Batch: <strong className="text-white">{result.batch || 'N/A'}</strong>
              </p>
              <div className="mt-6 flex justify-center">
                <Button
                  variant="secondary"
                  onClick={() => { setResult(null); inputRef.current?.focus(); }}
                  className="rounded-xl px-6"
                >
                  Verify Next Ticket →
                </Button>
              </div>
            </div>
          )}

          {/* 2. YELLOW: ALREADY CHECKED IN */}
          {result.status === 'duplicate' && (
            <div className="rounded-3xl p-8 bg-gradient-to-br from-amber-950/90 to-surface-900 border-2 border-amber-500/80 shadow-2xl text-center relative overflow-hidden">
              <div className="text-7xl mb-3 animate-scale-in">⚠️</div>
              <h2 className="text-3xl font-black text-amber-400 tracking-tight mb-1">
                ALREADY CHECKED IN
              </h2>
              <p className="text-xs uppercase tracking-widest text-amber-300/80 font-semibold mb-4">
                Duplicate Entry Attempt
              </p>
              <h3 className="text-2xl font-bold text-white mb-2">
                {result.student_name}
              </h3>
              <div className="flex flex-wrap items-center justify-center gap-3 mb-4">
                <span className="px-4 py-1 rounded-xl bg-black/40 border border-white/20 font-mono text-sm text-surface-200">
                  Roll: {result.roll_no}
                </span>
                {result.ticket_id && (
                  <span className="px-4 py-1 rounded-xl bg-amber-500 text-black font-mono font-bold text-sm">
                    🎟️ Ticket ID: {result.ticket_id}
                  </span>
                )}
              </div>
              <div className="max-w-md mx-auto bg-black/40 rounded-2xl p-4 border border-amber-500/30 text-left text-sm space-y-1 mb-6">
                <p className="text-amber-200">
                  ⏱️ First checked in at:{' '}
                  <strong className="text-white">
                    {result.scanned_at ? new Date(result.scanned_at).toLocaleTimeString() : 'Earlier today'}
                  </strong>
                </p>
                <p className="text-amber-200">
                  👤 Scanned by:{' '}
                  <strong className="text-white">{result.scanned_by || 'Gate Scanner'}</strong>
                </p>
              </div>
              <p className="text-xs text-surface-300 max-w-sm mx-auto mb-6">
                Inspect physical student card. If authorized by supervisor, click override below.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
                <button
                  type="button"
                  onClick={handleOverride}
                  disabled={overriding}
                  className="flex-1 py-3.5 px-6 rounded-xl bg-amber-500 text-black font-extrabold text-sm hover:bg-amber-400 transition-all shadow-lg active:scale-95 disabled:opacity-50"
                >
                  {overriding ? 'Logging Override...' : '⚠️ Force Override & Allow'}
                </button>
                <Button
                  variant="secondary"
                  onClick={() => { setResult(null); inputRef.current?.focus(); }}
                  className="rounded-xl"
                >
                  Deny Entry
                </Button>
              </div>
            </div>
          )}

          {/* 3. RED: INVALID OR EXPIRED */}
          {(result.status === 'invalid' || result.status === 'expired' || result.status === 'error') && (
            <div className="rounded-3xl p-8 bg-gradient-to-br from-rose-950/90 to-surface-900 border-2 border-rose-500/80 shadow-2xl text-center">
              <div className="text-7xl mb-3 animate-scale-in">❌</div>
              <h2 className="text-3xl font-black text-rose-400 tracking-tight mb-2">
                {result.status === 'expired' ? 'PASS EXPIRED' : 'INVALID PASS'}
              </h2>
              <p className="text-sm text-surface-300 max-w-md mx-auto mb-6">
                {result.message || 'Pass not recognized in the system database. Verify the Ticket ID or Roll Number.'}
              </p>
              <Button
                variant="secondary"
                onClick={() => { setResult(null); inputRef.current?.focus(); }}
                className="rounded-xl px-6"
              >
                Try Another Ticket
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Live Check-in Session History */}
      <div className="rounded-3xl bg-surface-900 border border-surface-800 p-6 shadow-xl">
        <div className="flex items-center justify-between pb-4 border-b border-surface-800">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>📋</span> Current Session Log
            </h3>
            <p className="text-xs text-surface-400">Recent check-ins processed at this terminal</p>
          </div>
          {history.length > 0 && (
            <button
              onClick={() => setHistory([])}
              className="text-xs text-surface-400 hover:text-white px-2 py-1 rounded hover:bg-surface-800"
            >
              Clear Log
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <div className="text-center py-10 text-surface-500 text-sm">
            No entries processed yet during this session. Ready for incoming guests!
          </div>
        ) : (
          <div className="divide-y divide-surface-800 mt-2 max-h-72 overflow-y-auto">
            {history.map((item) => (
              <div key={item.id} className="py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-surface-400 bg-surface-800 px-2 py-0.5 rounded">
                    {item.timestamp}
                  </span>
                  <div>
                    <p className="text-sm font-bold text-white leading-tight">{item.student_name}</p>
                    <p className="text-xs font-mono text-surface-400">{item.roll_no}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-xs font-bold text-surface-300 bg-surface-800/80 px-2.5 py-1 rounded-lg">
                    {item.ticket_id}
                  </span>
                  {item.status === 'valid' ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                      ALLOWED
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      OVERRIDE
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
