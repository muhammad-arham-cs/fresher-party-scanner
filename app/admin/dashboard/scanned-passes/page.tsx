'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ScannedPassItem {
  id: string;
  roll_no: string;
  student_name: string;
  department: string;
  batch: string;
  section: string; // Ticket ID
  society?: string;
  scanned_at: string;
  scanned_by: string;
  status: string;
  is_override: boolean;
  is_pm_pass: boolean;
}

const DEPARTMENTS = ['Computer Science', 'Artificial Intelligence', 'Data Science', 'Cyber Security'];

export default function ScannedPassesPage() {
  const [scans, setScans] = useState<ScannedPassItem[]>([]);
  const [totalScanned, setTotalScanned] = useState(0);
  const [scannedToday, setScannedToday] = useState(0);
  const [deptBreakdown, setDeptBreakdown] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedDept, setSelectedDept] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fetchScannedPasses = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (selectedDept && selectedDept !== 'all') params.set('department', selectedDept);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);

      const res = await fetch(`/api/admin/scanned-passes?${params.toString()}`);
      const data = await res.json();

      if (res.status === 403) {
        setError('Access denied: You do not have permission to view Scanned Passes. Please contact the Project Manager.');
        setScans([]);
        return;
      }

      if (data.success) {
        setScans(data.scans || []);
        setTotalScanned(data.total_scanned || 0);
        setScannedToday(data.scanned_today || 0);
        setDeptBreakdown(data.department_breakdown || {});
      } else {
        setError(data.message || 'Failed to load scanned passes');
      }
    } catch {
      setError('Network error connecting to scanner server');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, selectedDept, dateFrom, dateTo]);

  // Initial load
  useEffect(() => {
    fetchScannedPasses();
  }, [fetchScannedPasses]);

  const exportCSV = () => {
    if (scans.length === 0) return;
    const header = ['Ticket ID', 'Student Name', 'Roll Number', 'Department', 'Batch', 'Scanned At', 'Scanned By', 'Status'];
    const rows = scans.map((s) => [
      `"${s.section || ''}"`,
      `"${s.student_name || ''}"`,
      `"${s.roll_no || ''}"`,
      `"${s.department || ''}"`,
      `"${s.batch || ''}"`,
      `"${new Date(s.scanned_at).toLocaleString('en-PK')}"`,
      `"${s.scanned_by || ''}"`,
      `"${s.is_override ? 'Forced Override' : 'Valid Entry'}"`,
    ]);

    const csvContent = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `scanned-passes-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="section-title">Scanned Passes</h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Gate Admissions
            </span>
          </div>
          <p className="section-subtitle">
            Live attendance log of all student passes successfully scanned at event entry.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fetchScannedPasses(true)}
            loading={refreshing}
            className="border-surface-700 bg-surface-800 text-surface-200 hover:text-white"
          >
            <span>🔄</span> Refresh Data
          </Button>
          <Button
            variant="success"
            size="sm"
            onClick={exportCSV}
            disabled={scans.length === 0}
            className="font-bold"
          >
            📥 Export CSV ({scans.length})
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 rounded-xl bg-danger-500/10 border border-danger-500/30 text-danger-400 text-sm flex items-center gap-2">
          <span>⛔</span>
          <span>{error}</span>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Scanned */}
        <div className="stat-card border-primary-500/40 relative overflow-hidden bg-gradient-to-br from-surface-900 via-surface-900 to-primary-950/30">
          <div className="flex items-center justify-between">
            <p className="stat-label">Total Passes Admitted</p>
            <span className="text-xl">🎟️</span>
          </div>
          <p className="stat-value text-primary-400 text-3xl font-black mt-1">
            {totalScanned}
          </p>
          <p className="text-[11px] text-surface-400 mt-1">Unique attendees entered at gate</p>
        </div>

        {/* Scanned Today */}
        <div className="stat-card border-emerald-500/40 relative overflow-hidden bg-gradient-to-br from-surface-900 via-surface-900 to-emerald-950/30">
          <div className="flex items-center justify-between">
            <p className="stat-label">Admitted Today</p>
            <span className="text-xl">⚡</span>
          </div>
          <p className="stat-value text-emerald-400 text-3xl font-black mt-1">
            {scannedToday}
          </p>
          <p className="text-[11px] text-surface-400 mt-1">Checked in since midnight</p>
        </div>

        {/* Top Department */}
        <div className="stat-card border-purple-500/40 relative overflow-hidden sm:col-span-2 bg-gradient-to-br from-surface-900 via-surface-900 to-purple-950/30">
          <p className="stat-label mb-2">Department Breakdown</p>
          <div className="flex flex-wrap gap-2">
            {Object.keys(deptBreakdown).length === 0 ? (
              <span className="text-surface-500 text-xs">No scan records yet</span>
            ) : (
              Object.entries(deptBreakdown).map(([dept, count]) => (
                <div
                  key={dept}
                  className="px-2.5 py-1 rounded-lg bg-surface-800/80 border border-surface-700 text-xs flex items-center gap-1.5"
                >
                  <span className="text-surface-300 font-medium">{dept}:</span>
                  <span className="font-bold text-white font-mono bg-surface-700 px-1.5 py-0.5 rounded text-[11px]">
                    {count}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Filters Card */}
      <div className="card space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="lg:col-span-2">
            <Input
              label="Search Attendee"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, roll no, or ticket ID..."
              id="scanned-search-input"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Filter Department</label>
            <select
              className="form-input"
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              id="scanned-dept-filter"
            >
              <option value="all">All Departments</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                label="From Date"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                id="scanned-date-from"
              />
            </div>
            <div className="flex-1">
              <Input
                label="To Date"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                id="scanned-date-to"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Scanned Passes Table */}
      <div className="card p-0 overflow-hidden border border-surface-800 shadow-xl">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Attendee</th>
                <th>Roll Number</th>
                <th>Department</th>
                <th>Ticket ID</th>
                <th>Scanned Time</th>
                <th>Gate Volunteer</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-surface-400">
                    <div className="inline-block animate-spin mr-2">⏳</div> Loading admitted passes...
                  </td>
                </tr>
              ) : scans.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-surface-500">
                    <p className="text-3xl mb-2">🎟️</p>
                    <p className="text-sm font-semibold text-surface-300">No scanned passes found</p>
                    <p className="text-xs text-surface-500 mt-1">
                      {search || selectedDept !== 'all' ? 'Try adjusting your search filters' : 'Passes will appear here in real-time as volunteers scan attendees at the entrance'}
                    </p>
                  </td>
                </tr>
              ) : (
                scans.map((scan) => (
                  <tr key={scan.id} className="hover:bg-surface-800/40 transition-colors">
                    {/* Attendee */}
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow">
                          {scan.student_name ? scan.student_name.charAt(0).toUpperCase() : 'S'}
                        </div>
                        <div>
                          <div className="font-semibold text-white flex items-center gap-1.5">
                            <span>{scan.student_name}</span>
                            {scan.is_pm_pass && (
                              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-400 text-black font-extrabold uppercase">
                                VIP
                              </span>
                            )}
                          </div>
                          {scan.batch && (
                            <div className="text-[11px] text-surface-400">Batch {scan.batch}</div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Roll No */}
                    <td>
                      <span className="font-mono text-primary-400 text-xs font-semibold bg-surface-800/80 px-2 py-1 rounded border border-surface-700/60">
                        {scan.roll_no}
                      </span>
                    </td>

                    {/* Department */}
                    <td className="text-surface-300 text-xs">
                      {scan.department}
                    </td>

                    {/* Ticket ID */}
                    <td>
                      <span className="font-mono text-xs font-bold text-surface-200 bg-surface-950 px-2.5 py-1 rounded-md border border-surface-700">
                        {scan.section || '—'}
                      </span>
                    </td>

                    {/* Scanned Time */}
                    <td>
                      <div className="text-xs text-surface-200 font-mono">
                        {new Date(scan.scanned_at).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </div>
                      <div className="text-[10px] text-surface-500">
                        {new Date(scan.scanned_at).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </div>
                    </td>

                    {/* Volunteer */}
                    <td className="text-xs text-surface-300">
                      {scan.scanned_by}
                    </td>

                    {/* Status Badge */}
                    <td>
                      {scan.is_override ? (
                        <span className="badge badge-warning text-[10px]">⚡ Forced Entry</span>
                      ) : (
                        <span className="badge badge-success text-[10px]">✅ Admitted</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Count */}
        {scans.length > 0 && (
          <div className="p-3.5 bg-surface-950/80 border-t border-surface-800 flex items-center justify-between text-xs text-surface-400 px-4">
            <span>Showing <strong className="text-white">{scans.length}</strong> admitted attendee{scans.length === 1 ? '' : 's'}</span>
            <span>Total Gate Admissions: <strong className="text-primary-400">{totalScanned}</strong></span>
          </div>
        )}
      </div>
    </div>
  );
}
