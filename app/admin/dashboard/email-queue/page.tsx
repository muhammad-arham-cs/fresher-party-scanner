'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';

interface QuotaData {
  date?: string;
  hour?: number;
  minutes_to_reset?: number;
  hourly_used: number;
  hourly_limit: number;
  hourly_remaining: number;
  daily_used: number;
  daily_limit: number;
  daily_remaining: number;
  can_send: number;
  queued_count: number;
  is_cooldown: boolean;
  cooldown_reason?: string;
}

interface QueueStats {
  queued: number;
  sent: number;
  failed: number;
}

interface QueuedEmail {
  id: string;
  student_name?: string;
  email?: string;
  roll_no?: string;
  department?: string;
  batch?: string;
  society?: string;
  pass_pdf_url?: string;
  status: 'queued' | 'sent' | 'failed';
  attempts?: number;
  error_message?: string;
  created_at: string;
  sent_at?: string;
}

export default function EmailQueuePage() {
  const [quota, setQuota] = useState<QuotaData | null>(null);
  const [stats, setStats] = useState<QueueStats>({ queued: 0, sent: 0, failed: 0 });
  const [items, setItems] = useState<QueuedEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [testEmailInput, setTestEmailInput] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'queued' | 'sent' | 'failed'>('all');
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchQueueData = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/email-queue?status=${filterStatus}`);
      const data = await res.json();
      if (data.success) {
        setQuota(data.quota);
        setStats(data.stats || { queued: 0, sent: 0, failed: 0 });
        setItems(data.items || []);
      }
    } catch (err) {
      console.error('Failed to fetch email queue data:', err);
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    fetchQueueData();
    const interval = setInterval(fetchQueueData, 20000); // Live poll every 20 seconds
    return () => clearInterval(interval);
  }, [fetchQueueData]);

  const handleProcessNow = async () => {
    setProcessing(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/admin/email-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'process_now' }),
      });
      const data = await res.json();
      setStatusMessage({
        type: data.success ? 'success' : 'error',
        text: data.message || 'Queue processed.',
      });
      await fetchQueueData();
    } catch {
      setStatusMessage({ type: 'error', text: 'Error triggering queue processing.' });
    } finally {
      setProcessing(false);
    }
  };

  const handleSendTestEmail = async () => {
    setTesting(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/admin/email-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test_send',
          to_email: testEmailInput.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMessage({ type: 'success', text: data.message });
        setShowTestModal(false);
        setTestEmailInput('');
        await fetchQueueData();
      } else {
        setStatusMessage({ type: 'error', text: data.message || 'Failed to send test email.' });
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'Network error sending test email.' });
    } finally {
      setTesting(false);
    }
  };

  const handleRetry = async (id: string) => {
    setRetryingId(id);
    try {
      const res = await fetch('/api/admin/email-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry', id }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMessage({ type: 'success', text: 'Email re-queued for sending.' });
        await fetchQueueData();
      }
    } catch {
      alert('Error retrying email');
    } finally {
      setRetryingId(null);
    }
  };

  const sentThisHour = quota?.hourly_used ?? 0;
  const sentToday = quota?.daily_used ?? 0;
  const hourlyPercent = Math.min(100, Math.round((sentThisHour / 70) * 100));
  const dailyPercent = Math.min(100, Math.round((sentToday / 550) * 100));
  const minutesToReset = quota?.minutes_to_reset ?? 60;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-2">
            <span>📬</span> Email Queue & Delivery Monitor
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Real-time Brevo multi-API dispatcher · Rate limited to 70/hour & 550/day
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="secondary"
            onClick={fetchQueueData}
            size="sm"
            className="text-xs border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-gray-300"
          >
            🔄 Refresh
          </Button>
          <Button
            onClick={() => setShowTestModal(true)}
            size="sm"
            className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20"
          >
            🧪 Test Email Send
          </Button>
          <Button
            onClick={handleProcessNow}
            loading={processing}
            size="sm"
            className="bg-primary-600 hover:bg-primary-500 text-xs shadow-lg shadow-primary-600/20"
          >
            ⚡ Process Queue Now
          </Button>
        </div>
      </div>

      {/* Status banner */}
      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl border text-sm flex items-center justify-between ${
            statusMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          <span>{statusMessage.text}</span>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-xs opacity-70 hover:opacity-100 ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* Live Quota Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Hourly Card */}
        <div className="bg-slate-800/80 border border-slate-700/60 p-5 rounded-2xl shadow-xl backdrop-blur-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Emails This Hour</p>
            <span className="text-[11px] font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-500/20">
              UTC Hour {quota?.hour ?? '--'}:00
            </span>
          </div>
          <p className="text-3xl sm:text-4xl font-black text-white mt-2">
            {sentThisHour}
            <span className="text-base font-normal text-gray-400"> / 70</span>
          </p>
          <div className="w-full bg-gray-700/70 rounded-full h-2.5 mt-3 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                hourlyPercent >= 90 ? 'bg-rose-500' : hourlyPercent >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.max(5, hourlyPercent)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-gray-400 mt-2.5">
            <span>{Math.max(0, 70 - sentThisHour)} slots remaining</span>
            <span className="text-gray-400 font-medium">Resets in ~{minutesToReset}m</span>
          </div>
        </div>

        {/* Daily Card */}
        <div className="bg-slate-800/80 border border-slate-700/60 p-5 rounded-2xl shadow-xl backdrop-blur-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Emails Today</p>
            <span className="text-[11px] font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-md border border-purple-500/20">
              {quota?.date || 'Today'}
            </span>
          </div>
          <p className="text-3xl sm:text-4xl font-black text-white mt-2">
            {sentToday}
            <span className="text-base font-normal text-gray-400"> / 550</span>
          </p>
          <div className="w-full bg-gray-700/70 rounded-full h-2.5 mt-3 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                dailyPercent >= 90 ? 'bg-rose-500' : dailyPercent >= 70 ? 'bg-amber-500' : 'bg-purple-500'
              }`}
              style={{ width: `${Math.max(5, dailyPercent)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-gray-400 mt-2.5">
            <span>{Math.max(0, 550 - sentToday)} slots remaining</span>
            <span className="text-gray-400 font-medium">Daily cap: 550/day</span>
          </div>
        </div>

        {/* In Queue Card */}
        <div className="bg-slate-800/80 border border-slate-700/60 p-5 rounded-2xl shadow-xl backdrop-blur-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">In Queue</p>
            <span className="text-[11px] font-medium text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
              Auto-Cron
            </span>
          </div>
          <p className="text-3xl sm:text-4xl font-black text-white mt-2">
            {stats.queued}
            <span className="text-xs font-medium text-gray-400 ml-2">pending</span>
          </p>
          <p className="text-[11px] text-amber-400/90 flex items-center gap-1.5 mt-4">
            <span className="animate-spin text-xs">⏳</span> Auto-dispatches every 60s via cron
          </p>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl overflow-hidden shadow-xl">
        {/* Table Header & Filters */}
        <div className="p-4 sm:p-5 border-b border-gray-700/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white">Email Dispatches & Queue Log</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Live tracking of all passes sent or queued by Brevo
            </p>
          </div>

          {/* Status Filter Tabs */}
          <div className="flex items-center bg-slate-900/80 p-1 rounded-xl border border-slate-700/70 text-xs">
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                filterStatus === 'all'
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              All ({stats.queued + stats.sent + stats.failed})
            </button>
            <button
              onClick={() => setFilterStatus('queued')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                filterStatus === 'queued'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              ⏳ Queued ({stats.queued})
            </button>
            <button
              onClick={() => setFilterStatus('sent')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                filterStatus === 'sent'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              ✅ Sent ({stats.sent})
            </button>
            <button
              onClick={() => setFilterStatus('failed')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                filterStatus === 'failed'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              ❌ Failed ({stats.failed})
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="p-10 text-center text-gray-400 text-sm">
            <div className="inline-block animate-spin text-xl mb-2">🔄</div>
            <p>Loading email records from database...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <p className="text-4xl mb-2">📭</p>
            <p className="font-semibold text-white">No email dispatches found</p>
            <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
              Newly approved passes and manually sent passes will appear here with delivery timestamps.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-900/60 text-gray-400 text-xs uppercase tracking-wider border-b border-gray-700">
                <tr>
                  <th className="px-5 py-3.5">Recipient</th>
                  <th className="px-5 py-3.5">Student / Roll</th>
                  <th className="px-5 py-3.5">Department</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Dispatched / Queued</th>
                  <th className="px-5 py-3.5">Pass</th>
                  <th className="px-5 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/60">
                {items.map((item) => {
                  const targetEmail = item.email || 'N/A';
                  const isSent = item.status === 'sent';
                  const isQueued = item.status === 'queued';
                  const isFailed = item.status === 'failed';
                  const timestamp = item.sent_at || item.created_at;

                  return (
                    <tr key={item.id} className="hover:bg-slate-700/30 transition-colors">
                      <td className="px-5 py-3.5 font-mono text-xs text-blue-300">
                        {targetEmail}
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-white text-xs">{item.student_name || 'Student'}</p>
                        {item.roll_no && <p className="text-[11px] text-gray-400 font-mono">{item.roll_no}</p>}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-gray-300">
                        <span className="px-2 py-0.5 rounded-md bg-slate-700/70 text-gray-300 text-[11px]">
                          {item.department || 'CS'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        {isQueued && (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                            ⏳ Queued
                          </span>
                        )}
                        {isSent && (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            ✅ Sent
                          </span>
                        )}
                        {isFailed && (
                          <div>
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30">
                              ❌ Failed
                            </span>
                            {item.error_message && (
                              <p className="text-[10px] text-rose-400 mt-1 max-w-xs truncate" title={item.error_message}>
                                {item.error_message}
                              </p>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-gray-400 whitespace-nowrap">
                        {timestamp ? (
                          new Date(timestamp).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        ) : (
                          '--'
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-xs">
                        {item.pass_pdf_url ? (
                          <a
                            href={item.pass_pdf_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-primary-400 hover:text-primary-300 hover:underline"
                          >
                            <span>📄</span> View PDF
                          </a>
                        ) : (
                          <span className="text-[11px] text-gray-500">--</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {isFailed ? (
                          <button
                            onClick={() => handleRetry(item.id)}
                            disabled={retryingId === item.id}
                            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 transition-colors disabled:opacity-50"
                          >
                            {retryingId === item.id ? '...' : 'Retry'}
                          </button>
                        ) : isSent ? (
                          <span className="text-[11px] text-emerald-400/80 font-mono">Delivered</span>
                        ) : (
                          <span className="text-[11px] text-gray-500">In queue</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Test Email Modal */}
      {showTestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <span>🧪</span> Dispatch Diagnostic Email
              </h3>
              <button
                onClick={() => setShowTestModal(false)}
                className="text-gray-400 hover:text-white text-lg"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              This triggers a live transactional test email via your configured Brevo account. It will increment the hourly/daily quota counter and log a record in the dispatch table.
            </p>
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                Recipient Email Address
              </label>
              <input
                type="email"
                placeholder="Enter email or leave blank for admin email"
                value={testEmailInput}
                onChange={(e) => setTestEmailInput(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-primary-500"
              />
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowTestModal(false)}
                className="text-xs border-slate-700 text-gray-400"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                loading={testing}
                onClick={handleSendTestEmail}
                className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20"
              >
                Send Test Email Now
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
