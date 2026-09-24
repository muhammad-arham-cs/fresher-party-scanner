'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatPKTDateTime } from '@/lib/date-utils';

interface ScanLog {
  id: string;
  student_name: string;
  roll_no: string;
  scanned_by: string;
  scanned_at: string;
  status: 'valid' | 'already_scanned' | 'invalid';
  device_info: string | null;
}

const STATUS_MAP = {
  valid: { label: '✅ Valid', class: 'badge-success' },
  already_scanned: { label: '⚠️ Duplicate', class: 'badge-warning' },
  invalid: { label: '❌ Invalid', class: 'badge-danger' },
};

export default function ScannerLogsPage() {
  const [logs, setLogs] = useState<ScanLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: '', volunteer: '', date_from: '', date_to: '' });

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, v]) => v)));
      const res = await fetch(`/api/admin/scanner-logs?${params}`);
      const data = await res.json();
      if (data.success) setLogs(data.logs);
    } catch {/* ignore */} finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const exportCSV = () => {
    const header = ['Time', 'Student', 'Roll No', 'Volunteer', 'Status'];
    const rows = logs.map((l) => [
      formatPKTDateTime(l.scanned_at, true),
      l.student_name, l.roll_no, l.scanned_by,
      l.status,
    ]);
    const csv = [header, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'scanner-logs.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const validCount = logs.filter((l) => l.status === 'valid').length;
  const dupCount = logs.filter((l) => l.status === 'already_scanned').length;
  const invalidCount = logs.filter((l) => l.status === 'invalid').length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="section-title">Scanner Logs</h1>
          <p className="section-subtitle">Full audit trail of all gate scans.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={exportCSV} id="export-csv-btn">📥 Export CSV</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="stat-card border-success-500/30"><p className="stat-value text-success-400">{validCount}</p><p className="stat-label">Valid Entries</p></div>
        <div className="stat-card border-warning-500/30"><p className="stat-value text-warning-400">{dupCount}</p><p className="stat-label">Duplicates</p></div>
        <div className="stat-card border-danger-500/30"><p className="stat-value text-danger-400">{invalidCount}</p><p className="stat-label">Invalid QRs</p></div>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="form-group">
            <label className="form-label">Status</label>
            <select className="form-input" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} id="sl-status">
              <option value="">All</option>
              <option value="valid">Valid</option>
              <option value="already_scanned">Duplicate</option>
              <option value="invalid">Invalid</option>
            </select>
          </div>
          <Input label="Volunteer Name" value={filters.volunteer} onChange={(e) => setFilters((f) => ({ ...f, volunteer: e.target.value }))} placeholder="Search volunteer..." id="sl-volunteer" />
          <Input label="From Date" type="date" value={filters.date_from} onChange={(e) => setFilters((f) => ({ ...f, date_from: e.target.value }))} id="sl-date-from" />
          <Input label="To Date" type="date" value={filters.date_to} onChange={(e) => setFilters((f) => ({ ...f, date_to: e.target.value }))} id="sl-date-to" />
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Student</th>
                <th>Roll No</th>
                <th>Volunteer</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-12 text-surface-400">Loading logs...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-surface-500">No scan logs found</td></tr>
              ) : (
                logs.map((log) => {
                  const statusInfo = STATUS_MAP[log.status] || { label: log.status, class: 'badge-neutral' };
                  return (
                    <tr key={log.id}>
                      <td className="text-surface-400 text-xs font-mono">{formatPKTDateTime(log.scanned_at, true)}</td>
                      <td className="font-medium text-white">{log.student_name}</td>
                      <td className="font-mono text-primary-400 text-xs">{log.roll_no}</td>
                      <td className="text-surface-300">{log.scanned_by}</td>
                      <td><span className={`badge ${statusInfo.class}`}>{statusInfo.label}</span></td>
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
