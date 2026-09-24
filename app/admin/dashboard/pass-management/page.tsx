'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';

interface Pass {
  id: string;
  roll_no: string;
  name: string;
  email: string | null;
  department: string;
  batch: string;
  society: string;
  pass_status: string;
  source: string;
  section?: string;
  ticket_id?: string;
  qr_token?: string;
  pass_pdf_url: string | null;
  pass_generated_at: string | null;
  pass_sent_at: string | null;
  entry_created_by: string;
  created_at: string;
}

const STATUS_LABELS: Record<string, { label: string; class: string }> = {
  generated: { label: 'Generated', class: 'badge-neutral' },
  email_sent: { label: 'Email Sent', class: 'badge-success' },
  sent_via_whatsapp: { label: 'WhatsApp Sent', class: 'badge-primary' },
  revoked: { label: 'Revoked', class: 'badge-danger bg-red-500/10 text-red-400 border border-red-500/30' },
};

const SOURCE_LABELS: Record<string, { label: string; class: string }> = {
  excel_automated: { label: 'Excel', class: 'badge-primary' },
  manual_entry: { label: 'Manual', class: 'badge-neutral' },
};

export default function PassManagementPage() {
  const [passes, setPasses] = useState<Pass[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [downloadingRoll, setDownloadingRoll] = useState<string | null>(null);
  const [emailingRoll, setEmailingRoll] = useState<string | null>(null);
  const [revokingPassId, setRevokingPassId] = useState<string | null>(null);
  const [deletingPassId, setDeletingPassId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchPasses = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: statusFilter, search, limit: '100' });
      const res = await fetch(`/api/admin/passes?${params}`);
      const data = await res.json();
      if (data.success) { setPasses(data.passes); setTotal(data.total || data.passes.length); }
    } catch {/* ignore */} finally { setLoading(false); }
  }, [statusFilter, search]);

  useEffect(() => { fetchPasses(); }, [fetchPasses]);

  const handleMarkWhatsapp = async (passId: string) => {
    setActionLoading(passId);
    try {
      await fetch('/api/admin/mark-whatsapp-sent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pass_id: passId }),
      });
      await fetchPasses();
    } finally { setActionLoading(null); }
  };

  const handleDownloadPdf = async (rollNo: string) => {
    setDownloadingRoll(rollNo);
    try {
      const res = await fetch(`/api/admin/passes/download?roll_no=${encodeURIComponent(rollNo)}`);
      const data = await res.json();
      if (data.success && data.url) {
        window.open(data.url, '_blank');
      } else {
        alert(data.message || 'Could not generate pass download link');
      }
    } catch {
      alert('Error fetching download link');
    } finally {
      setDownloadingRoll(null);
    }
  };

  const handleSendEmail = async (rollNo: string, email: string | null) => {
    if (!email) {
      alert('This student does not have an email address.');
      return;
    }
    setEmailingRoll(rollNo);
    setToastMessage(null);
    try {
      const res = await fetch('/api/admin/passes/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roll_no: rollNo }),
      });
      const data = await res.json();
      if (data.success) {
        setToastMessage({
          type: 'success',
          text: `✅ Pass sent to ${email}! Logged and added +1 to daily email quota.`,
        });
        await fetchPasses();
      } else {
        setToastMessage({
          type: 'error',
          text: `❌ ${data.message || 'Failed to send pass email.'}`,
        });
      }
    } catch {
      setToastMessage({ type: 'error', text: '❌ Network error sending pass email.' });
    } finally {
      setEmailingRoll(null);
    }
  };

  const handleToggleRevoke = async (pass: Pass) => {
    const isCurrentlyRevoked = pass.pass_status === 'revoked';
    const confirmMessage = isCurrentlyRevoked
      ? `Reactivate entry pass for ${pass.name} (${pass.roll_no})?\n\nTheir QR code and Ticket ID will become VALID for scanning at the gate again.`
      : `Are you sure you want to REVOKE the pass for ${pass.name} (${pass.roll_no})?\n\nEntry will be strictly DENIED at the gate (even if previously checked in).`;

    if (!confirm(confirmMessage)) return;

    setRevokingPassId(pass.id);
    try {
      const res = await fetch('/api/admin/passes/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pass_id: pass.id,
          action: isCurrentlyRevoked ? 'restore' : 'revoke',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setToastMessage({
          type: 'success',
          text: `✅ ${data.message}`,
        });
        await fetchPasses();
      } else {
        setToastMessage({
          type: 'error',
          text: `❌ ${data.message || 'Failed to update pass status'}`,
        });
      }
    } catch {
      setToastMessage({ type: 'error', text: '❌ Network error changing pass status.' });
    } finally {
      setRevokingPassId(null);
    }
  };

  const handleDeletePass = async (pass: Pass) => {
    const confirmMsg = `Are you sure you want to PERMANENTLY DELETE the pass for ${pass.name} (${pass.roll_no})?\n\nThis will completely remove the pass from the database so you can re-generate a new pass for this student either manually or via Excel upload.`;
    if (!confirm(confirmMsg)) return;

    setDeletingPassId(pass.id);
    try {
      const res = await fetch('/api/admin/passes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pass_id: pass.id }),
      });
      const data = await res.json();
      if (data.success) {
        setToastMessage({
          type: 'success',
          text: `🗑️ ${data.message}`,
        });
        await fetchPasses();
      } else {
        setToastMessage({
          type: 'error',
          text: `❌ ${data.message || 'Failed to delete pass'}`,
        });
      }
    } catch {
      setToastMessage({ type: 'error', text: '❌ Network error deleting pass.' });
    } finally {
      setDeletingPassId(null);
    }
  };

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="section-title">Pass Management</h1>
          <p className="section-subtitle">View, download signed passes, send emails, and track issuance status.</p>
        </div>
        <div className="badge badge-neutral text-base px-4 py-2">{total} Total Passes</div>
      </div>

      {toastMessage && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-sm animate-fade-in ${
            toastMessage.type === 'success'
              ? 'bg-success-500/10 border-success-500/30 text-success-400'
              : 'bg-danger-500/10 border-danger-500/30 text-danger-400'
          }`}
        >
          <span>{toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="ml-3 hover:opacity-75 font-bold">✕</button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          className="form-input max-w-xs"
          placeholder="Search by name or roll no..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          id="pm-search"
        />
        <select className="form-input w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} id="pm-status-filter">
          <option value="all">All Statuses</option>
          <option value="generated">Generated</option>
          <option value="email_sent">Email Sent</option>
          <option value="sent_via_whatsapp">WhatsApp Sent</option>
          <option value="revoked">Revoked</option>
        </select>
        <Button variant="secondary" size="sm" onClick={fetchPasses} id="pm-refresh-btn">Refresh</Button>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Ticket ID</th>
                <th>Roll No</th>
                <th>Name</th>
                <th>Department</th>
                <th>Email</th>
                <th>Status</th>
                <th>Source</th>
                <th>Generated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-12 text-surface-400">Loading passes...</td></tr>
              ) : passes.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-surface-500">No passes found</td></tr>
              ) : (
                passes.map((pass) => {
                  const statusInfo = STATUS_LABELS[pass.pass_status] || { label: pass.pass_status, class: 'badge-neutral' };
                  const sourceInfo = SOURCE_LABELS[pass.source] || { label: pass.source, class: 'badge-neutral' };
                  const ticketId = pass.ticket_id || (pass.section && pass.section.startsWith('FP26-') ? pass.section : (pass.qr_token ? 'FP26-' + pass.qr_token.replace(/-/g, '').slice(0, 5) : ''));
                  return (
                    <tr key={pass.id}>
                      <td className="font-mono text-emerald-400 font-bold text-xs">{ticketId}</td>
                      <td className="font-mono text-primary-400 text-xs">{pass.roll_no}</td>
                      <td className="font-semibold text-white">{pass.name}</td>
                      <td className="text-surface-300 text-xs">{pass.department}</td>
                      <td className="text-surface-400 text-xs">{pass.email || <span className="text-danger-400">No email</span>}</td>
                      <td><span className={`badge ${statusInfo.class}`}>{statusInfo.label}</span></td>
                      <td><span className={`badge ${sourceInfo.class}`}>{sourceInfo.label}</span></td>
                      <td className="text-surface-400 text-xs">{formatDate(pass.pass_generated_at)}</td>
                      <td>
                        <div className="flex gap-1.5 items-center flex-wrap">
                          <button
                            onClick={() => handleDownloadPdf(pass.roll_no)}
                            disabled={downloadingRoll === pass.roll_no}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-primary-600/20 text-primary-400 hover:bg-primary-600/40 transition-colors disabled:opacity-50"
                            title="Download pass with secure link"
                          >
                            {downloadingRoll === pass.roll_no ? '...' : '📄 PDF'}
                          </button>
                          <button
                            onClick={() => handleSendEmail(pass.roll_no, pass.email)}
                            disabled={emailingRoll === pass.roll_no || !pass.email}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
                              pass.pass_status === 'email_sent'
                                ? 'bg-surface-800 text-surface-300 hover:bg-surface-700'
                                : 'bg-primary-600/20 text-primary-300 hover:bg-primary-600/40 border border-primary-500/30'
                            }`}
                            title={pass.email ? `Send pass to ${pass.email}` : 'No email address available'}
                          >
                            {emailingRoll === pass.roll_no ? '⏳ ...' : '📧 Email'}
                          </button>
                          {pass.pass_status === 'generated' && (
                            <button
                              onClick={() => handleMarkWhatsapp(pass.id)}
                              disabled={actionLoading === pass.id}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-success-600/20 text-success-400 hover:bg-success-600/40 transition-colors disabled:opacity-50"
                              title="Mark as sent via WhatsApp"
                            >
                              {actionLoading === pass.id ? '...' : '📱 WhatsApp'}
                            </button>
                          )}
                          {/* Revoke / Restore / Delete Pass Buttons */}
                          {pass.pass_status !== 'revoked' ? (
                            <button
                              onClick={() => handleToggleRevoke(pass)}
                              disabled={revokingPassId === pass.id}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 transition-colors disabled:opacity-50"
                              title="Revoke pass (invalidates QR code and strictly denies gate entry)"
                            >
                              {revokingPassId === pass.id ? '⏳ ...' : '🚫 Revoke'}
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={() => handleToggleRevoke(pass)}
                                disabled={revokingPassId === pass.id}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
                                title="Reactivate pass (re-enables QR code for gate entry)"
                              >
                                {revokingPassId === pass.id ? '⏳ ...' : '🔄 Reactivate'}
                              </button>
                              <button
                                onClick={() => handleDeletePass(pass)}
                                disabled={deletingPassId === pass.id}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors disabled:opacity-50"
                                title="Permanently delete pass record (enables fresh re-generation)"
                              >
                                {deletingPassId === pass.id ? '⏳ ...' : '🗑️ Delete'}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
