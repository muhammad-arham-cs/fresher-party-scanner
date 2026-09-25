'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatPKTDateTime } from '@/lib/date-utils';

const DEPARTMENTS = ['Computer Science', 'Artificial Intelligence', 'Data Science', 'Cyber Security'];
const SOCIETIES = ['CS', 'AI', 'DS', 'CY'];
const BATCHES = ['2026', '2025', '2024', '2023', '2022', '2021'];

interface ExistingPass {
  id?: string;
  roll_no: string;
  pass_pdf_url: string;
  pass_status: string;
  is_revoked?: boolean;
}

interface ConflictItem {
  id: string;
  student_roll_no: string;
  student_name?: string;
  conflicting_admin_email: string;
  created_at: string;
  pm_pass?: any;
  conflicting_pass?: any;
}

export default function ManualEntryPage() {
  const [form, setForm] = useState({
    name: '', roll_no: '', email: '', department: '', batch: '', section: '', society: '', is_society_member: false,
  });
  const [isPM, setIsPM] = useState(false);
  const [passMode, setPassMode] = useState<'normal' | 'stealth'>('normal');
  const [sendEmailDirectly, setSendEmailDirectly] = useState(true);
  const [loading, setLoading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailFeedback, setEmailFeedback] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{
    pass_pdf_url: string;
    email_sent: boolean;
    roll_no: string;
    email: string;
    name: string;
    is_pm_pass?: boolean;
  } | null>(null);
  const [existingPass, setExistingPass] = useState<ExistingPass | null>(null);

  // Conflicts State
  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
  const [resolvingConflictId, setResolvingConflictId] = useState<string | null>(null);

  // Global Settings State
  const [requireEmail, setRequireEmail] = useState(true);
  const [togglingSetting, setTogglingSetting] = useState(false);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/admin/settings');
      const data = await res.json();
      if (data.success && data.settings) {
        setRequireEmail(Boolean(data.settings.require_email_for_manual_pass));
      }
    } catch {
      /* ignore */
    }
  };

  const handleToggleEmailRequirement = async () => {
    if (!isPM || togglingSetting) return;
    const nextVal = !requireEmail;
    setTogglingSetting(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ require_email_for_manual_pass: nextVal }),
      });
      const data = await res.json();
      if (data.success && data.settings) {
        setRequireEmail(Boolean(data.settings.require_email_for_manual_pass));
      } else {
        alert(data.message || 'Failed to update email requirement setting');
      }
    } catch {
      alert('Error updating setting');
    } finally {
      setTogglingSetting(false);
    }
  };

  // Check Session on mount to customize PM experience
  useEffect(() => {
    async function loadSession() {
      try {
        fetchSettings();
        const res = await fetch('/api/auth/session');
        const data = await res.json();
        if (data.success && data.admin) {
          const pm = data.admin.role === 'PROJECT_MANAGER' ||
            ['muhammadarham979@gmail.com', 'arham.personal28@gmail.com'].includes(data.admin.email?.toLowerCase());
          setIsPM(pm);
          // Default email sending to true for Normal Mode
          setSendEmailDirectly(true);

          if (pm) {
            fetchConflicts();
          }
        }
      } catch {
        /* ignore */
      }
    }
    loadSession();
  }, []);

  const fetchConflicts = async () => {
    try {
      const res = await fetch('/api/admin/conflicts');
      const data = await res.json();
      if (data.success) {
        setConflicts(data.conflicts || []);
      }
    } catch {
      /* ignore */
    }
  };

  const handleResolveConflict = async (conflictId: string, resolution: 'merge' | 'keep_both' | 'dismiss') => {
    setResolvingConflictId(conflictId);
    try {
      const res = await fetch('/api/admin/conflicts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conflict_id: conflictId, resolution }),
      });
      const data = await res.json();
      if (data.success) {
        setConflicts((prev) => prev.filter((c) => c.id !== conflictId));
      } else {
        alert(data.message || 'Failed to resolve conflict');
      }
    } catch {
      alert('Error connecting to server to resolve conflict');
    } finally {
      setResolvingConflictId(null);
    }
  };

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
    setError('');
    setExistingPass(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const isStealthMode = Boolean(isPM && passMode === 'stealth');

    if (isStealthMode) {
      if (!form.name.trim() || !form.roll_no.trim()) {
        setError('Student Name and Roll Number are required for Stealth pass generation.');
        return;
      }
    } else {
      const emailIsRequired = Boolean(requireEmail);
      if (
        !form.name.trim() ||
        !form.roll_no.trim() ||
        !form.department.trim() ||
        !form.batch.trim() ||
        (emailIsRequired && !form.email.trim())
      ) {
        setError(
          emailIsRequired
            ? 'Full Name, Roll Number, Email, Department, and Batch are required for Normal pass generation.'
            : 'Full Name, Roll Number, Department, and Batch are required for Normal pass generation.'
        );
        return;
      }
    }

    setLoading(true);
    setError('');
    setEmailFeedback(null);
    setExistingPass(null);

    try {
      const res = await fetch('/api/admin/manual-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          pass_mode: isPM ? passMode : 'normal',
          send_email_now: form.email.trim() ? sendEmailDirectly : false,
        }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setExistingPass(data.existing_pass);
        return;
      }
      if (data.success) {
        setSuccess({
          pass_pdf_url: data.pass_pdf_url,
          email_sent: data.email_sent,
          roll_no: data.roll_no || form.roll_no,
          email: data.email || form.email,
          name: data.name || form.name,
          is_pm_pass: data.is_pm_pass,
        });
        setForm({ name: '', roll_no: '', email: '', department: '', batch: '', section: '', society: '', is_society_member: false });
      } else {
        setError(data.message || 'Failed to create pass');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendManualPassEmail = async () => {
    if (!success?.roll_no) return;
    setSendingEmail(true);
    setEmailFeedback(null);
    setError('');
    try {
      const res = await fetch('/api/admin/passes/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roll_no: success.roll_no }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess((prev) => prev ? { ...prev, email_sent: true } : null);
        setEmailFeedback(`✅ Pass emailed successfully to ${success.email}! Logged and recorded in quota.`);
      } else {
        setError(data.message || 'Failed to send pass email.');
      }
    } catch {
      setError('Network error sending pass email.');
    } finally {
      setSendingEmail(false);
    }
  };

  const [downloading, setDownloading] = useState(false);

  const handleDownloadPass = async (rollNo: string, fallbackUrl?: string) => {
    setDownloading(true);
    try {
      const res = await fetch(`/api/admin/passes/download?roll_no=${encodeURIComponent(rollNo)}`);
      const data = await res.json();
      if (data.success && data.url) {
        window.open(data.url, '_blank');
      } else if (fallbackUrl) {
        window.open(fallbackUrl, '_blank');
      } else {
        alert(data.message || 'Could not download pass');
      }
    } catch {
      if (fallbackUrl) {
        window.open(fallbackUrl, '_blank');
      } else {
        alert('Error fetching download link');
      }
    } finally {
      setDownloading(false);
    }
  };

  const [reactivating, setReactivating] = useState(false);
  const [deletingExisting, setDeletingExisting] = useState(false);

  const handleReactivateExisting = async (passId?: string, rollNo?: string) => {
    setReactivating(true);
    setError('');
    setEmailFeedback(null);
    try {
      const res = await fetch('/api/admin/passes/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pass_id: passId,
          roll_no: rollNo,
          action: 'restore',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setEmailFeedback(`✅ Pass reactivated! The student's QR code is now valid for entry.`);
        setExistingPass(null);
      } else {
        setError(data.message || 'Failed to reactivate pass');
      }
    } catch {
      setError('Network error reactivating pass');
    } finally {
      setReactivating(false);
    }
  };

  const handleDeleteExisting = async (passId?: string) => {
    if (!passId) return;
    if (!confirm('Are you sure you want to permanently delete this pass record? You will then be able to generate a fresh new pass with a new ticket ID.')) return;
    setDeletingExisting(true);
    setError('');
    setEmailFeedback(null);
    try {
      const res = await fetch('/api/admin/passes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pass_id: passId }),
      });
      const data = await res.json();
      if (data.success) {
        setEmailFeedback(`🗑️ Pass deleted permanently. You can now click "Generate Pass" below to create a fresh new pass.`);
        setExistingPass(null);
      } else {
        setError(data.message || 'Failed to delete pass');
      }
    } catch {
      setError('Network error deleting pass');
    } finally {
      setDeletingExisting(false);
    }
  };

  const reset = () => {
    setSuccess(null);
    setExistingPass(null);
    setError('');
    setEmailFeedback(null);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* ─── PM Conflict Alerts Section (Only for PM) ─── */}
      {isPM && conflicts.length > 0 && (
        <div className="p-5 rounded-2xl bg-amber-500/10 border-2 border-amber-500/40 shadow-xl space-y-3 animate-slide-down">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl animate-bounce">⚠️</span>
            <div>
              <h3 className="font-black text-amber-300 text-sm tracking-tight">
                Duplicate Pass Attempt Detected ({conflicts.length})
              </h3>
              <p className="text-xs text-amber-200/80">
                Another admin generated a pass for a student you already created a stealth pass for. Choose how to handle this conflict below:
              </p>
            </div>
          </div>

          <div className="space-y-2.5 pt-1">
            {conflicts.map((conflict) => (
              <div
                key={conflict.id}
                className="p-3.5 rounded-xl bg-surface-950/80 border border-amber-500/30 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <span>{conflict.student_name || 'Student'}</span>
                    <span className="font-mono bg-surface-800 px-2 py-0.5 rounded text-[11px] text-amber-300 border border-amber-500/30">
                      {conflict.student_roll_no}
                    </span>
                  </div>
                  <div className="text-[11px] text-surface-400 mt-1">
                    👤 Generated by: <strong className="text-surface-200">{conflict.conflicting_admin_email}</strong> ·{' '}
                    <span>{formatPKTDateTime(conflict.created_at)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button
                    onClick={() => handleResolveConflict(conflict.id, 'merge')}
                    disabled={resolvingConflictId === conflict.id}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] shadow transition-all"
                    title="Keep both passes valid at gate"
                  >
                    Merge Passes
                  </button>
                  <button
                    onClick={() => handleResolveConflict(conflict.id, 'keep_both')}
                    disabled={resolvingConflictId === conflict.id}
                    className="px-3 py-1.5 rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-200 font-semibold text-[11px] border border-surface-700 transition-all"
                    title="Keep both as separate tickets"
                  >
                    Keep Both
                  </button>
                  <button
                    onClick={() => handleResolveConflict(conflict.id, 'dismiss')}
                    disabled={resolvingConflictId === conflict.id}
                    className="px-2.5 py-1.5 rounded-lg text-surface-400 hover:text-white text-[11px] transition-all"
                    title="Dismiss alert"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h1 className="section-title">Manual Pass Entry</h1>
          {isPM && (
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${passMode === 'stealth'
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                : 'bg-primary-500/20 text-primary-300 border-primary-500/30'
              }`}>
              {passMode === 'stealth' ? '🛡️ PM Stealth Mode' : '🎟️ Normal Mode'}
            </span>
          )}
        </div>
        <p className="section-subtitle">
          {isPM
            ? passMode === 'stealth'
              ? 'Generate VIP or offline stealth passes. Stealth passes are hidden from all other admins, public logs, and queue metrics.'
              : 'Generate standard official passes. Fully visible across Pass Management, Scanner Logs, Email Queue, and Audit Logs.'
            : 'Add a student entry directly for late registrations or society members.'}
        </p>
      </div>

      {/* ─── PM Global Email Mandatory Toggle ─── */}
      {isPM && !success && (
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${
              requireEmail ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
            }`}>
              {requireEmail ? '✉️' : '🔓'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">Manual Pass Email Requirement</span>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-extrabold border ${
                  requireEmail
                    ? 'bg-primary-500/20 text-primary-300 border-primary-500/30'
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                }`}>
                  {requireEmail ? 'EMAIL MANDATORY' : 'EMAIL OPTIONAL (LIFTED OFF)'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {requireEmail
                  ? 'All admins must enter student email to generate manual passes.'
                  : 'Mandatory email lifted! Admins can generate passes with or without student email (direct PDF download).'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleToggleEmailRequirement}
            disabled={togglingSetting}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 disabled:opacity-50 whitespace-nowrap self-start sm:self-auto ${
              requireEmail
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30'
            }`}
          >
            {togglingSetting ? 'Saving...' : requireEmail ? 'Lift Email Requirement' : 'Enforce Email Requirement'}
          </button>
        </div>
      )}

      {!isPM && !requireEmail && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2 text-xs text-emerald-300">
          <span>🟢</span>
          <span><strong>Email entry is optional:</strong> You can generate a pass with or without email and download the PDF pass directly.</span>
        </div>
      )}

      {/* ─── PM Pass Mode Selector (Only visible to Project Manager) ─── */}
      {isPM && !success && (
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
              Pass Generation Type
            </span>
            <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${passMode === 'stealth'
                ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                : 'bg-primary-500/10 text-primary-300 border-primary-500/30'
              }`}>
              {passMode === 'stealth' ? '🛡️ Stealth Active' : '🎟️ Normal Mode Active'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Normal Pass Option */}
            <button
              type="button"
              onClick={() => {
                setPassMode('normal');
                setSendEmailDirectly(true);
                setError('');
              }}
              className={`p-3.5 rounded-xl border text-left transition-all relative ${passMode === 'normal'
                  ? 'bg-primary-500/10 border-primary-500/60 ring-1 ring-primary-500/40 shadow-lg shadow-primary-500/10'
                  : 'bg-slate-800/60 border-slate-700/60 hover:bg-slate-800 hover:border-slate-600'
                }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-sm text-white flex items-center gap-1.5">
                  <span>🎟️</span> Normal Pass
                </span>
                {passMode === 'normal' && (
                  <span className="w-2 h-2 rounded-full bg-primary-400 animate-pulse" />
                )}
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Official student pass. Visible to all admins across Pass Management, Scanner Logs, Email Queue, and Audit Logs.
              </p>
            </button>

            {/* Stealth Pass Option */}
            <button
              type="button"
              onClick={() => {
                setPassMode('stealth');
                setSendEmailDirectly(false);
                setError('');
              }}
              className={`p-3.5 rounded-xl border text-left transition-all relative ${passMode === 'stealth'
                  ? 'bg-amber-500/10 border-amber-500/60 ring-1 ring-amber-500/40 shadow-lg shadow-amber-500/10'
                  : 'bg-slate-800/60 border-slate-700/60 hover:bg-slate-800 hover:border-slate-600'
                }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-sm text-amber-300 flex items-center gap-1.5">
                  <span>🛡️</span> Stealth Pass (Ghost)
                </span>
                {passMode === 'stealth' && (
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                )}
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Private / VIP pass. Completely hidden from all other admins, scanner logs, and queue metrics.
              </p>
            </button>
          </div>
        </div>
      )}

      {success && (
        <div className="p-6 rounded-2xl bg-success-500/10 border border-success-500/30 animate-scale-in space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">✅</span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-success-400 font-bold text-lg">Pass Generated Successfully!</p>
                {success.is_pm_pass && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-400 text-black font-extrabold uppercase">
                    PM Stealth Pass
                  </span>
                )}
              </div>
              <p className="text-surface-300 text-sm mt-1">
                Student: <span className="font-semibold text-white">{success.name}</span> ({success.roll_no})
              </p>
              <p className="text-surface-400 text-sm mt-0.5">
                {success.email_sent
                  ? `📧 Pass sent directly to ${success.email}.`
                  : success.email
                    ? `📥 Pass generated for ${success.email} without auto-sending. Download or send below.`
                    : `📥 Pass generated without email. Download PDF or send via WhatsApp below.`}
              </p>
              {emailFeedback && (
                <p className="text-emerald-400 text-xs mt-2 font-medium bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">
                  {emailFeedback}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button
              variant="success"
              id="download-pass-btn"
              loading={downloading}
              onClick={() => handleDownloadPass(success.roll_no, success.pass_pdf_url)}
            >
              📄 Download PDF Pass
            </Button>
            {success.email && (
              <Button
                variant="secondary"
                loading={sendingEmail}
                onClick={handleSendManualPassEmail}
                id="manual-email-send-btn"
                className="border-primary-500/40 text-primary-300 hover:bg-primary-500/20"
              >
                📧 {success.email_sent ? 'Resend Pass via Email' : 'Send Pass via Email'}
              </Button>
            )}
            <a
              href={`https://wa.me/?text=${encodeURIComponent(
                `🎉 DUET Fresher Party 2026 Entry Pass\n\nName: ${success.name}\nRoll No: ${success.roll_no}\nDownload Pass: ${success.pass_pdf_url}`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="secondary" className="border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20">
                📱 Send via WhatsApp
              </Button>
            </a>
            <Button variant="ghost" onClick={reset}>Add Another Pass</Button>
          </div>
        </div>
      )}

      {existingPass && (
        <div className={`p-5 rounded-2xl border animate-scale-in space-y-3 ${existingPass.pass_status === 'revoked'
            ? 'bg-rose-500/10 border-rose-500/30'
            : 'bg-warning-500/10 border-warning-500/30'
          }`}>
          <div className="flex items-center gap-2">
            <span className="text-xl">{existingPass.pass_status === 'revoked' ? '⛔' : '⚠️'}</span>
            <div>
              <p className={`font-bold ${existingPass.pass_status === 'revoked' ? 'text-rose-400' : 'text-warning-400'}`}>
                {existingPass.pass_status === 'revoked'
                  ? 'Pass Already Generated, but is currently REVOKED'
                  : `This student already has an active pass (${existingPass.pass_status})`}
              </p>
              <p className="text-surface-300 text-xs mt-0.5">
                Roll Number: <span className="font-mono text-white font-semibold">{existingPass.roll_no}</span>
              </p>
            </div>
          </div>
          <div className="flex gap-2.5 flex-wrap pt-1">
            {existingPass.pass_status === 'revoked' && (
              <Button
                variant="success"
                size="sm"
                loading={reactivating}
                onClick={() => handleReactivateExisting(existingPass.id, existingPass.roll_no)}
              >
                🔄 Reactivate Pass
              </Button>
            )}
            {existingPass.id && (
              <Button
                variant="danger"
                size="sm"
                loading={deletingExisting}
                onClick={() => handleDeleteExisting(existingPass.id)}
              >
                🗑️ Delete Old Pass
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              loading={downloading}
              onClick={() => handleDownloadPass(existingPass.roll_no, existingPass.pass_pdf_url)}
            >
              📄 Download Existing PDF
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setExistingPass(null)}>Dismiss</Button>
          </div>
        </div>
      )}

      {!success && (
        <form onSubmit={handleSubmit} className="card space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-danger-500/10 border border-danger-500/30 text-danger-400 text-sm">{error}</div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Student Name"
              value={form.name}
              onChange={set('name')}
              placeholder="e.g. Ali Khan"
              required
              id="me-name"
            />
            <Input
              label="Roll Number"
              value={form.roll_no}
              onChange={set('roll_no')}
              placeholder="e.g. 24F-CS-001"
              required
              id="me-roll"
            />
          </div>

          <Input
            label={(!requireEmail || (isPM && passMode === 'stealth')) ? 'Email (Optional)' : 'Email'}
            type="email"
            value={form.email}
            onChange={set('email')}
            placeholder={(!requireEmail || (isPM && passMode === 'stealth')) ? 'Optional — leave blank for physical pass / direct download' : 'student@duet.edu.pk'}
            required={Boolean(requireEmail && (!isPM || passMode === 'normal'))}
            id="me-email"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">
                Department {(!isPM || passMode === 'normal') ? <span className="text-danger-400">*</span> : '(Optional)'}
              </label>
              <select className="form-input" value={form.department} onChange={set('department')} required={!isPM || passMode === 'normal'} id="me-department">
                <option value="">{(isPM && passMode === 'stealth') ? 'Default (General)' : 'Select department'}</option>
                {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">
                Batch {(!isPM || passMode === 'normal') ? <span className="text-danger-400">*</span> : '(Optional)'}
              </label>
              <select className="form-input" value={form.batch} onChange={set('batch')} required={!isPM || passMode === 'normal'} id="me-batch">
                <option value="">{(isPM && passMode === 'stealth') ? 'Default (2026)' : 'Select batch'}</option>
                {BATCHES.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Section (optional)" value={form.section} onChange={set('section')} placeholder="e.g. A" id="me-section" />
            <div className="form-group">
              <label className="form-label">Society (optional)</label>
              <select className="form-input" value={form.society} onChange={set('society')} id="me-society">
                <option value="">None / Not Applicable</option>
                {SOCIETIES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-3 pt-1 border-t border-surface-800">
            {form.email.trim() && (
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendEmailDirectly}
                  onChange={(e) => setSendEmailDirectly(e.target.checked)}
                  className="w-4 h-4 rounded border-surface-600 bg-surface-900 text-primary-500 focus:ring-primary-500"
                  id="me-send-email-directly"
                />
                <span className="text-sm text-surface-200">
                  {isPM && passMode === 'stealth'
                    ? '📧 Send pass to student email immediately (leave unchecked to generate without emailing)'
                    : 'Send pass via entered email immediately'}
                </span>
              </label>
            )}

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_society_member}
                onChange={set('is_society_member')}
                className="w-4 h-4 rounded border-surface-600 bg-surface-900 text-primary-500 focus:ring-primary-500"
                id="me-society-member"
              />
              <span className="text-sm text-surface-300">This student is a society member</span>
            </label>
          </div>

          <Button
            type="submit"
            loading={loading}
            size="lg"
            className={`w-full font-bold transition-all ${isPM && passMode === 'stealth'
                ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-lg shadow-amber-500/20'
                : 'btn-primary'
              }`}
            id="me-submit-btn"
          >
            {isPM && passMode === 'stealth' ? '🛡️ Generate Stealth Pass' : '🎟️ Generate Normal Pass'}
          </Button>
        </form>
      )}
    </div>
  );
}
