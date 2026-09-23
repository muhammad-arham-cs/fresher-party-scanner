'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const DEPARTMENTS = ['Computer Science', 'Artificial Intelligence', 'Data Science', 'Cyber Security'];
const SOCIETIES = ['CS', 'AI', 'DS', 'CY'];
const BATCHES = ['2024', '2023', '2022', '2021'];

interface ExistingPass {
  roll_no: string;
  pass_pdf_url: string;
  pass_status: string;
}

export default function ManualEntryPage() {
  const [form, setForm] = useState({
    name: '', roll_no: '', email: '', department: '', batch: '', section: '', society: '', is_society_member: false,
  });
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
  } | null>(null);
  const [existingPass, setExistingPass] = useState<ExistingPass | null>(null);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
    setError('');
    setExistingPass(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.roll_no.trim() || !form.email.trim() || !form.department.trim() || !form.batch.trim()) {
      setError('Full Name, Roll Number, Email, Department, and Batch are required.');
      return;
    }
    setLoading(true);
    setError('');
    setEmailFeedback(null);
    setExistingPass(null);
    try {
      const res = await fetch('/api/admin/manual-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, send_email_now: sendEmailDirectly }),
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
        setEmailFeedback(`✅ Pass emailed successfully to ${success.email}! Logged and added +1 to daily email quota.`);
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

  const reset = () => {
    setSuccess(null);
    setExistingPass(null);
    setError('');
    setEmailFeedback(null);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="section-title">Manual Entry</h1>
        <p className="section-subtitle">Add a student directly — for late cash registrations or society members.</p>
      </div>

      {success && (
        <div className="p-6 rounded-2xl bg-success-500/10 border border-success-500/30 animate-scale-in space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">✅</span>
            <div className="flex-1">
              <p className="text-success-400 font-bold text-lg">Pass Generated!</p>
              <p className="text-surface-300 text-sm">
                Student: <span className="font-semibold text-white">{success.name}</span> ({success.roll_no})
              </p>
              <p className="text-surface-400 text-sm mt-0.5">
                {success.email_sent
                  ? `📧 Pass sent to ${success.email} and recorded in daily quota.`
                  : `📥 Pass generated for ${success.email}. Send via Email, WhatsApp, or Download below.`}
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
            <Button
              variant="secondary"
              loading={sendingEmail}
              onClick={handleSendManualPassEmail}
              id="manual-email-send-btn"
              className="border-primary-500/40 text-primary-300 hover:bg-primary-500/20"
            >
              📧 {success.email_sent ? 'Resend Pass via Email' : 'Send Pass via Email'}
            </Button>
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
            <Button variant="ghost" onClick={reset}>Add Another</Button>
          </div>
        </div>
      )}

      {existingPass && (
        <div className="p-5 rounded-2xl bg-warning-500/10 border border-warning-500/30 animate-scale-in">
          <p className="text-warning-400 font-semibold mb-2">⚠️ This student already has a pass ({existingPass.pass_status})</p>
          <div className="flex gap-3">
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
              label="Full Name *"
              value={form.name}
              onChange={set('name')}
              placeholder="Full Name"
              required
              id="me-name"
            />
            <Input
              label="Roll Number *"
              value={form.roll_no}
              onChange={set('roll_no')}
              placeholder="e.g. 24F-CS-001"
              required
              id="me-roll"
            />
          </div>

          <Input
            label="Email *"
            type="email"
            value={form.email}
            onChange={set('email')}
            placeholder="your@email.com"
            required
            id="me-email"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">Department <span className="text-danger-400">*</span></label>
              <select className="form-input" value={form.department} onChange={set('department')} required id="me-department">
                <option value="">Select department</option>
                {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Batch <span className="text-danger-400">*</span></label>
              <select className="form-input" value={form.batch} onChange={set('batch')} required id="me-batch">
                <option value="">Select batch</option>
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
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={sendEmailDirectly}
                onChange={(e) => setSendEmailDirectly(e.target.checked)}
                className="w-4 h-4 rounded border-surface-600 bg-surface-900 text-primary-500 focus:ring-primary-500"
                id="me-send-email-directly"
              />
              <span className="text-sm text-surface-200">
                Send pass via entered email immediately
              </span>
            </label>

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

          <Button type="submit" loading={loading} size="lg" className="w-full" id="me-submit-btn">
            Generate Pass
          </Button>
        </form>
      )}
    </div>
  );
}
