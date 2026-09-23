'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';

interface ValidationIssue {
  roll_no: string;
  name: string;
  issue_type: string;
  detail: string;
}

interface ExcelRow {
  name: string;
  roll_no: string;
  email: string;
  department: string;
  batch: string;
  section?: string;
  society?: string;
  existing_ticket_id?: string;
  pass_status?: string;
  created_at?: string;
}

interface UploadResult {
  total_rows: number;
  valid_count: number;
  already_generated_count: number;
  issue_count: number;
  issues: ValidationIssue[];
  valid_rows: ExcelRow[];
  already_generated_rows: ExcelRow[];
  flagged_rows: ExcelRow[];
  rows: ExcelRow[];
}

const ISSUE_TYPE_LABELS: Record<string, string> = {
  duplicate: '🔁 Duplicate',
  missing_email: '📧 Missing Email',
  incomplete_data: '⚠️ Incomplete',
  invalid_format: '❌ Invalid Format',
  other: '🔍 Other',
};

export default function ExcelUploadPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState('');
  const [approvalResult, setApprovalResult] = useState<{
    total: number;
    processed: number;
    emails_sent: number;
    emails_queued: number;
    skipped: number;
  } | null>(null);
  // Track which flagged rows admin has approved/rejected
  const [flaggedDecisions, setFlaggedDecisions] = useState<Record<string, 'approve' | 'reject'>>({});
  const [dragOver, setDragOver] = useState(false);

  const handleFileSelect = useCallback((selectedFile: File) => {
    setFile(selectedFile);
    setResult(null);
    setError('');
    setApprovalResult(null);
    setFlaggedDecisions({});
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFileSelect(dropped);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/admin/upload-excel', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        setResult(data);
      } else {
        setError(data.message || 'Failed to process file');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleApproveAll = async () => {
    if (!result) return;
    setApproving(true);
    setError('');
    try {
      // Combine valid rows + flagged rows that admin approved
      const approvedFlagged = result.flagged_rows.filter(
        (r) => flaggedDecisions[r.roll_no] === 'approve'
      );
      const entriesToApprove = [...result.valid_rows, ...approvedFlagged];

      if (entriesToApprove.length === 0) {
        setError('No new entries to generate.');
        setApproving(false);
        return;
      }

      const res = await fetch('/api/admin/approve-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: entriesToApprove }),
      });
      const data = await res.json();
      if (data.success) {
        setApprovalResult({
          total: data.total || entriesToApprove.length,
          processed: data.processed || 0,
          emails_sent: data.emails_sent || 0,
          emails_queued: data.emails_queued || 0,
          skipped: data.skipped || 0,
        });
      } else {
        setError(data.message || 'Approval failed');
      }
    } catch {
      setError('Network error during approval.');
    } finally {
      setApproving(false);
    }
  };

  const toggleFlaggedDecision = (rollNo: string, decision: 'approve' | 'reject') => {
    setFlaggedDecisions((prev) => ({ ...prev, [rollNo]: decision }));
  };

  const approvedFlaggedCount = Object.values(flaggedDecisions).filter((d) => d === 'approve').length;
  const pendingFlaggedCount = (result?.flagged_rows.length || 0) - Object.keys(flaggedDecisions).length;
  const newPassCount = (result?.valid_count || 0) + approvedFlaggedCount;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="section-title">Excel Upload & Pass Generation</h1>
        <p className="section-subtitle">Upload registration spreadsheet to generate passes & dispatch emails</p>
      </div>

      {/* Upload zone */}
      {!result && (
        <div
          className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-200 cursor-pointer ${dragOver ? 'border-primary-500 bg-primary-500/10' : 'border-surface-600 hover:border-primary-600 hover:bg-surface-800/50'}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            id="excel-file-input"
            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
          />
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-surface-800 flex items-center justify-center">
            <svg className="w-7 h-7 text-surface-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          {file ? (
            <>
              <p className="text-white font-semibold">{file.name}</p>
              <p className="text-surface-400 text-sm mt-1">{(file.size / 1024).toFixed(1)} KB — Click to change</p>
            </>
          ) : (
            <>
              <p className="text-white font-medium mb-1">Drop your Excel or CSV file here</p>
              <p className="text-surface-400 text-sm">Supports .xlsx, .xls, .csv — Columns: Name, Roll No, Email, Department, Batch</p>
            </>
          )}
        </div>
      )}

      {file && !result && (
        <div className="flex gap-3">
          <Button onClick={handleUpload} loading={uploading} size="lg" className="flex-1" id="upload-validate-btn">
            🤖 Upload & Validate Spreadsheet
          </Button>
          <Button variant="ghost" onClick={() => { setFile(null); setError(''); }} size="lg">
            Cancel
          </Button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-danger-500/10 border border-danger-500/30 text-danger-400 text-sm">{error}</div>
      )}

      {/* Approval success banner */}
      {approvalResult && (
        <div className="p-6 rounded-2xl bg-gradient-to-r from-success-500/15 via-emerald-500/10 to-surface-800 border border-success-500/30 animate-scale-in space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-4xl">🎉</span>
            <div>
              <p className="text-success-400 font-black text-xl">Passes & Emails Dispatched!</p>
              <p className="text-surface-300 text-sm mt-0.5">
                Batch processing finished for {approvalResult.processed} students.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
            <div className="p-3 rounded-xl bg-surface-900/60 border border-surface-800">
              <div className="text-xs text-surface-400 font-medium">Passes Generated</div>
              <div className="text-lg font-bold text-white mt-1">{approvalResult.processed}</div>
            </div>
            <div className="p-3 rounded-xl bg-surface-900/60 border border-surface-800">
              <div className="text-xs text-surface-400 font-medium">Emails Sent (PDF)</div>
              <div className="text-lg font-bold text-success-400 mt-1">{approvalResult.emails_sent}</div>
            </div>
            {approvalResult.emails_queued > 0 && (
              <div className="p-3 rounded-xl bg-surface-900/60 border border-surface-800">
                <div className="text-xs text-surface-400 font-medium">Emails Queued</div>
                <div className="text-lg font-bold text-warning-400 mt-1">{approvalResult.emails_queued}</div>
              </div>
            )}
            {approvalResult.skipped > 0 && (
              <div className="p-3 rounded-xl bg-surface-900/60 border border-surface-800">
                <div className="text-xs text-surface-400 font-medium">Existing Skipped</div>
                <div className="text-lg font-bold text-sky-400 mt-1">{approvalResult.skipped}</div>
              </div>
            )}
          </div>

          <div className="pt-2">
            <Button onClick={() => { setFile(null); setResult(null); setApprovalResult(null); setFlaggedDecisions({}); }} variant="secondary" size="sm">
              Upload Another File
            </Button>
          </div>
        </div>
      )}

      {/* Validation results view */}
      {result && !approvalResult && (
        <div className="space-y-6 animate-fade-in">
          {/* 4 Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="stat-card">
              <p className="stat-value">{result.total_rows}</p>
              <p className="stat-label">Total Rows</p>
            </div>
            <div className="stat-card border-success-500/30">
              <p className="stat-value text-success-400">{result.valid_count}</p>
              <p className="stat-label">New to Generate</p>
            </div>
            <div className="stat-card border-sky-500/30">
              <p className="stat-value text-sky-400">{result.already_generated_count || 0}</p>
              <p className="stat-label">Already Generated</p>
            </div>
            <div className="stat-card border-warning-500/30">
              <p className="stat-value text-warning-400">{result.issue_count}</p>
              <p className="stat-label">Issues Found</p>
            </div>
          </div>

          {/* Already Generated Section (Detected from database) */}
          {result.already_generated_rows && result.already_generated_rows.length > 0 && (
            <div className="card border-sky-500/30 bg-sky-950/10">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-sky-400">ℹ️</span>
                  <h2 className="text-base font-bold text-white">
                    Already Generated Passes ({result.already_generated_rows.length})
                  </h2>
                </div>
                <span className="text-xs text-sky-400 font-semibold bg-sky-500/10 px-2.5 py-1 rounded-full border border-sky-500/20">
                  Preserved & Skipped
                </span>
              </div>
              <p className="text-xs text-surface-400 mb-4">
                These students already have active passes in the database. They will not be duplicated.
              </p>
              <div className="overflow-x-auto -mx-6">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Roll No</th>
                      <th>Name</th>
                      <th>Ticket ID</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.already_generated_rows.map((row) => (
                      <tr key={row.roll_no}>
                        <td className="font-mono text-sky-400 text-xs font-semibold">{row.roll_no}</td>
                        <td className="text-white font-medium">{row.name}</td>
                        <td>
                          <span className="font-mono text-xs px-2 py-0.5 rounded bg-surface-800 text-primary-300 border border-primary-500/20">
                            {row.existing_ticket_id || 'Assigned'}
                          </span>
                        </td>
                        <td>
                          <span className="badge badge-success text-[11px]">
                            {row.pass_status === 'email_sent' ? '✓ Email Sent' : '✓ Pass Active'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Flagged entries */}
          {result.flagged_rows.length > 0 && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-white">⚠️ Flagged Entries ({result.flagged_rows.length})</h2>
                <p className="text-xs text-surface-400">
                  {pendingFlaggedCount > 0 ? `${pendingFlaggedCount} pending review` : 'All reviewed'}
                </p>
              </div>
              <div className="overflow-x-auto -mx-6">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Roll No</th>
                      <th>Name</th>
                      <th>Issue</th>
                      <th>Detail</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.flagged_rows.map((row) => {
                      const issue = result.issues.find((i) => i.roll_no === row.roll_no);
                      const decision = flaggedDecisions[row.roll_no];
                      return (
                        <tr key={row.roll_no}>
                          <td className="font-mono text-primary-400 text-xs">{row.roll_no || '—'}</td>
                          <td className="font-medium text-white">{row.name || '—'}</td>
                          <td>
                            <span className="badge badge-warning text-xs">
                              {ISSUE_TYPE_LABELS[issue?.issue_type || 'other']}
                            </span>
                          </td>
                          <td className="text-surface-400 text-xs max-w-xs">{issue?.detail}</td>
                          <td>
                            <div className="flex gap-2">
                              <button
                                onClick={() => toggleFlaggedDecision(row.roll_no, 'approve')}
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${decision === 'approve' ? 'bg-success-600 text-white' : 'bg-surface-700 text-surface-300 hover:bg-success-600/20 hover:text-success-400'}`}
                              >
                                ✓ Approve
                              </button>
                              <button
                                onClick={() => toggleFlaggedDecision(row.roll_no, 'reject')}
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${decision === 'reject' ? 'bg-danger-600 text-white' : 'bg-surface-700 text-surface-300 hover:bg-danger-600/20 hover:text-danger-400'}`}
                              >
                                ✕ Reject
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Valid entries preview */}
          {result.valid_rows.length > 0 && (
            <div className="card">
              <h2 className="text-lg font-bold text-white mb-4">
                ✅ New Entries Ready to Generate ({result.valid_rows.length})
              </h2>
              <div className="overflow-x-auto -mx-6">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Roll No</th>
                      <th>Name</th>
                      <th>Department</th>
                      <th>Batch</th>
                      <th>Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.valid_rows.map((row) => (
                      <tr key={row.roll_no}>
                        <td className="font-mono text-primary-400 text-xs font-semibold">{row.roll_no}</td>
                        <td className="font-medium text-white">{row.name}</td>
                        <td className="text-surface-300 text-xs">{row.department}</td>
                        <td className="text-surface-300 text-xs">{row.batch}</td>
                        <td className="text-surface-400 text-xs">
                          {row.email ? (
                            <span className="text-emerald-400">{row.email}</span>
                          ) : (
                            <span className="badge badge-warning text-[10px]">No email</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Approve and generate button */}
          <div className="flex gap-3 pt-2">
            <Button
              onClick={handleApproveAll}
              loading={approving}
              size="lg"
              className="flex-1 bg-primary-600 hover:bg-primary-500 shadow-lg shadow-primary-900/30"
              id="approve-all-btn"
              disabled={pendingFlaggedCount > 0 || newPassCount === 0}
            >
              {newPassCount > 0
                ? `🚀 Generate Passes & Send Emails (${newPassCount} students)`
                : 'All Students Already Have Passes'}
            </Button>
            <Button variant="ghost" onClick={() => { setFile(null); setResult(null); setFlaggedDecisions({}); }} size="lg">
              Cancel
            </Button>
          </div>
          {pendingFlaggedCount > 0 && (
            <p className="text-center text-warning-400 text-sm">
              ⚠️ Please review all {pendingFlaggedCount} flagged entries before approving.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
