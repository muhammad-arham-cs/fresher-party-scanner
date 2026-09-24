'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatPKTDateTime } from '@/lib/date-utils';

interface AuditLog {
  id: string;
  action_type: 'double_scan_forced' | 'pass_downloaded' | 'manual_entry_created' | 'admin_login' | 'email_sent' | 'admin_user_invited';

  performed_by: string;
  roll_no?: string;
  student_name?: string;
  details?: Record<string, unknown>;
  created_at: string;
}

const ACTION_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  double_scan_forced: { label: 'Double Scan Forced', color: 'bg-rose-500/10 text-rose-400 border-rose-500/30', icon: '⚠️' },
  pass_downloaded: { label: 'Pass Downloaded', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30', icon: '📥' },
  manual_entry_created: { label: 'Manual Entry Created', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', icon: '✍️' },
  admin_login: { label: 'Admin Login', color: 'bg-purple-500/10 text-purple-400 border-purple-500/30', icon: '🔑' },
  email_sent: { label: 'Email Sent', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30', icon: '📧' },
  admin_user_invited: { label: 'Admin Invited', color: 'bg-teal-500/10 text-teal-400 border-teal-500/30', icon: '👤' },
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [doubleScansCount, setDoubleScansCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('action', filter);
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/admin/audit-logs?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setLogs(data.logs);
        if (data.stats) {
          setDoubleScansCount(data.stats.double_scans || 0);
        }
      }
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Security Audit Trail</h1>
          <p className="text-surface-400 text-sm">
            Immutable tracking of double scan overrides, downloads, logins, and manual passes
          </p>
        </div>
        <Button variant="secondary" onClick={fetchLogs} size="sm" className="text-xs self-start">
          🔄 Refresh Logs
        </Button>
      </div>

      {/* Double Scan Alert Banner (Security Update #3) */}
      {doubleScansCount > 0 && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="font-bold text-sm">Suspicious Entries Detected</p>
              <p className="text-xs text-rose-200/80">
                {doubleScansCount} double scan {doubleScansCount === 1 ? 'override was' : 'overrides were'} forced by volunteers at the gate.
              </p>
            </div>
          </div>
          <button
            onClick={() => setFilter('double_scan_forced')}
            className="text-xs px-3 py-1.5 rounded-xl bg-rose-600 text-white font-bold hover:bg-rose-500 transition-colors"
          >
            View Double Scans →
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        {/* Action Filter Pills */}
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'all', label: 'All Actions' },
            { id: 'double_scan_forced', label: '⚠️ Double Scans' },
            { id: 'pass_downloaded', label: '📥 Downloads' },
            { id: 'manual_entry_created', label: '✍️ Manual Passes' },
            { id: 'admin_login', label: '🔑 Logins' },
            { id: 'email_sent', label: '📧 Emails' },
            { id: 'admin_user_invited', label: '👤 Invites' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                filter === tab.id
                  ? 'bg-primary-600 text-white shadow-md shadow-primary-500/20'
                  : 'text-surface-400 hover:text-white hover:bg-surface-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="w-full sm:w-64">
          <Input
            placeholder="Search roll no, name, user..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-xs"
          />
        </div>
      </div>

      {/* Logs Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-surface-400 text-sm">Loading audit logs...</div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-surface-400">
            <p className="text-4xl mb-2">🛡️</p>
            <p className="font-semibold text-white">No audit records found</p>
            <p className="text-xs text-surface-500 mt-1">Actions performed by team members will be logged here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-800/50 text-surface-400 text-xs uppercase tracking-wider border-b border-surface-800">
                <tr>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Student Affected</th>
                  <th className="px-4 py-3">Performed By</th>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Event Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-800">
                {logs.map((log) => {
                  const meta = ACTION_LABELS[log.action_type] || {
                    label: log.action_type,
                    color: 'bg-surface-800 text-surface-300 border-surface-700',
                    icon: '📝',
                  };

                  return (
                    <tr
                      key={log.id}
                      className={`hover:bg-surface-800/30 transition-colors ${
                        log.action_type === 'double_scan_forced' ? 'bg-rose-500/5' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${meta.color}`}
                        >
                          <span>{meta.icon}</span>
                          <span>{meta.label}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {log.student_name ? (
                          <div>
                            <p className="font-bold text-white text-xs">{log.student_name}</p>
                            <p className="font-mono text-[11px] text-primary-400">{log.roll_no}</p>
                          </div>
                        ) : (
                          <span className="text-surface-500 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-semibold text-surface-200">
                          👤 {log.performed_by}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-surface-400 text-xs whitespace-nowrap font-mono">
                        {formatPKTDateTime(log.created_at, true)}
                      </td>
                      <td className="px-4 py-3 text-xs text-surface-400 max-w-xs">
                        {log.details ? (
                          <div className="font-mono text-[11px] bg-surface-950/60 p-2 rounded-lg border border-surface-800 truncate" title={JSON.stringify(log.details, null, 2)}>
                            {Object.entries(log.details).map(([k, v]) => `${k}: ${v}`).join(' | ')}
                          </div>
                        ) : (
                          <span className="text-surface-600">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
