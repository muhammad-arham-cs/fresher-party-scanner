'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface UserPermissionItem {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  is_pm: boolean;
  custom_permissions: {
    audit_logs: boolean;
    scanner_logs: boolean;
    manual_entry: boolean;
    user_management: boolean;
    scanned_passes: boolean;
  };
}

export default function PermissionManagementPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserPermissionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [migrationNeeded, setMigrationNeeded] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [systemSettings, setSystemSettings] = useState<{
    require_email_for_manual_pass: boolean;
    hourly_email_override: boolean;
  }>({
    require_email_for_manual_pass: true,
    hourly_email_override: false,
  });
  const [updatingSettingKey, setUpdatingSettingKey] = useState<string | null>(null);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/admin/settings');
      const data = await res.json();
      if (data.success && data.settings) {
        setSystemSettings(data.settings);
      }
    } catch {
      /* ignore */
    }
  };

  const handleToggleSystemSetting = async (key: 'require_email_for_manual_pass' | 'hourly_email_override') => {
    if (updatingSettingKey) return;
    const nextVal = !systemSettings[key];
    setUpdatingSettingKey(key);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: nextVal }),
      });
      const data = await res.json();
      if (data.success && data.settings) {
        setSystemSettings(data.settings);
        setSuccessToast(`Rule updated: ${key === 'require_email_for_manual_pass' ? 'Email Requirement' : 'Hourly Limit Override'} is now ${nextVal ? 'ON' : 'OFF'}`);
        setTimeout(() => setSuccessToast(null), 3000);
      } else {
        setError(data.message || 'Failed to update setting');
      }
    } catch {
      setError('Error communicating with server');
    } finally {
      setUpdatingSettingKey(null);
    }
  };

  const MIGRATION_SQL = `-- Run this in your Supabase Dashboard -> SQL Editor:
ALTER TABLE admin_users 
ADD COLUMN IF NOT EXISTS custom_permissions JSONB DEFAULT '{"audit_logs": false, "scanner_logs": false, "manual_entry": false, "user_management": false, "scanned_passes": false}'::jsonb;

ALTER TABLE approved_passes 
ADD COLUMN IF NOT EXISTS created_by_pm BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS pm_pass_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pm_pass_id UUID REFERENCES approved_passes(id) ON DELETE CASCADE,
  conflicting_pass_id UUID REFERENCES approved_passes(id) ON DELETE CASCADE,
  student_roll_no TEXT NOT NULL,
  student_name TEXT,
  conflicting_admin_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

ALTER TABLE pm_pass_conflicts ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pm_pass_conflicts' AND policyname = 'Service role full access on pm_pass_conflicts'
  ) THEN
    CREATE POLICY "Service role full access on pm_pass_conflicts" 
    ON pm_pass_conflicts FOR ALL USING (true);
  END IF;
END $$;`;

  const copyMigrationSql = () => {
    navigator.clipboard.writeText(MIGRATION_SQL);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 3000);
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/permissions');
      if (res.status === 401) {
        router.push('/admin/login');
        return;
      }
      if (res.status === 403) {
        setError('Access denied: Only the Project Manager can view or manage permissions.');
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (data.success) {
        setUsers(data.users || []);
        if (data.migration_needed) {
          setMigrationNeeded(true);
        } else {
          setMigrationNeeded(false);
        }
      } else {
        setError(data.message || 'Failed to load permissions');
      }
    } catch {
      setError('Network error loading permissions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggle = async (
    userId: string,
    permission: 'audit_logs' | 'scanner_logs' | 'manual_entry' | 'user_management' | 'scanned_passes',
    currentVal: boolean
  ) => {
    const key = `${userId}-${permission}`;
    setSavingKey(key);
    const nextVal = !currentVal;

    // Optimistic UI update
    setUsers((prev) =>
      prev.map((u) => {
        if (u.id === userId) {
          return {
            ...u,
            custom_permissions: {
              ...u.custom_permissions,
              [permission]: nextVal,
            },
          };
        }
        return u;
      })
    );

    try {
      const res = await fetch('/api/admin/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          permission,
          enabled: nextVal,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        // Rollback on error
        setUsers((prev) =>
          prev.map((u) => {
            if (u.id === userId) {
              return {
                ...u,
                custom_permissions: {
                  ...u.custom_permissions,
                  [permission]: currentVal,
                },
              };
            }
            return u;
          })
        );
        alert(data.message || 'Failed to update permission');
      } else {
        setSuccessToast(`Updated ${permission.replace('_', ' ')} permission`);
        setTimeout(() => setSuccessToast(null), 2500);
      }
    } catch {
      alert('Network error updating permission');
    } finally {
      setSavingKey(null);
    }
  };

  const filteredUsers = users.filter((u) =>
    u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.role?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed top-5 right-5 z-50 bg-emerald-500/90 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-xl backdrop-blur border border-emerald-400/40 animate-slide-down flex items-center gap-2">
          <span>✓</span>
          <span>{successToast}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="card bg-gradient-to-r from-surface-900 via-surface-900/90 to-surface-800 border-surface-700/60 p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-full opacity-10 pointer-events-none"
             style={{ background: 'radial-gradient(circle at 100% 50%, #3b82f6, transparent 70%)' }} />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xl">🛡️</span>
              <h1 className="text-2xl font-black text-white tracking-tight">Permission Management</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-primary-500/20 text-primary-300 border border-primary-500/30">
                PM Exclusive
              </span>
            </div>
            <p className="text-xs text-surface-400 max-w-2xl leading-relaxed">
              Dynamically control access to confidential admin areas. Non-PM users cannot view Audit Logs, Scanner Logs, Manual Pass Entry, or User Management unless explicitly granted below.
            </p>
          </div>
          <button
            onClick={fetchUsers}
            disabled={loading}
            className="self-start md:self-auto px-4 py-2 bg-surface-800 hover:bg-surface-700 text-white text-xs font-semibold rounded-xl border border-surface-700 transition-all flex items-center gap-2 shadow-sm"
          >
            <span>🔄</span> Refresh Matrix
          </button>
        </div>
      </div>

      {migrationNeeded && (
        <div className="p-5 rounded-2xl bg-amber-500/10 border-2 border-amber-500/40 text-xs space-y-3 animate-slide-down shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚡</span>
              <div>
                <h4 className="font-bold text-amber-300 text-sm">Supabase Database Setup Required</h4>
                <p className="text-amber-200/80 text-xs mt-0.5">
                  The <code className="bg-surface-900 px-1.5 py-0.5 rounded text-amber-400 font-mono">custom_permissions</code> column has not been added to your database yet. Copy the SQL below and run it in your Supabase SQL Editor to enable saving permissions.
                </p>
              </div>
            </div>
            <button
              onClick={copyMigrationSql}
              className="self-start sm:self-auto px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold transition-all flex items-center gap-2 shadow text-xs whitespace-nowrap"
            >
              <span>{copiedSql ? '✓ Copied to Clipboard!' : '📋 Copy Migration SQL'}</span>
            </button>
          </div>
          <div className="p-3 rounded-xl bg-surface-950/90 border border-amber-500/20 font-mono text-[11px] text-surface-300 overflow-x-auto">
            <p className="text-amber-400 font-bold mb-1 text-[10px] uppercase tracking-wider">// Quick SQL Snippet (Run in Supabase Dashboard -&gt; SQL Editor):</p>
            <code>ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS custom_permissions JSONB DEFAULT &apos;&#123;&quot;audit_logs&quot;: false, &quot;scanner_logs&quot;: false, &quot;manual_entry&quot;: false, &quot;user_management&quot;: false&#125;&apos;::jsonb;</code>
          </div>
        </div>
      )}

      {error && !migrationNeeded && (
        <div className="p-4 rounded-xl bg-danger-500/10 border border-danger-500/30 text-danger-300 text-xs">
          ⚠️ {error}
        </div>
      )}

      {/* ─── Global System Controls & Overrides (PM Only) ─── */}
      <div className="p-5 rounded-2xl bg-surface-900/90 border border-surface-700/60 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-surface-800 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">⚙️</span>
            <div>
              <h3 className="text-sm font-bold text-white">Global Event Operational Rules & Overrides</h3>
              <p className="text-xs text-surface-400">Settings applied system-wide across all admin users and dispatch engines.</p>
            </div>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-primary-500/20 text-primary-300 border border-primary-500/30 font-bold uppercase">
            Project Manager Only
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Rule 1: Email Mandatory for Manual Pass */}
          <div className="p-4 rounded-xl bg-surface-950/80 border border-surface-800 flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>✉️</span> Manual Pass Email Requirement
                </span>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-extrabold border ${
                  systemSettings.require_email_for_manual_pass
                    ? 'bg-primary-500/20 text-primary-300 border-primary-500/30'
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                }`}>
                  {systemSettings.require_email_for_manual_pass ? 'MANDATORY' : 'OPTIONAL (LIFTED)'}
                </span>
              </div>
              <p className="text-[11px] text-surface-400 mt-1">
                {systemSettings.require_email_for_manual_pass
                  ? 'Admins are strictly required to input student email for manual passes.'
                  : 'Mandatory email lifted! Admins can generate passes with or without email and download PDF directly.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleToggleSystemSetting('require_email_for_manual_pass')}
              disabled={updatingSettingKey === 'require_email_for_manual_pass'}
              className={`w-full py-2 px-3 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50 ${
                systemSettings.require_email_for_manual_pass
                  ? 'bg-surface-800 hover:bg-surface-700 text-surface-200 border border-surface-700'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30'
              }`}
            >
              {updatingSettingKey === 'require_email_for_manual_pass'
                ? 'Updating...'
                : systemSettings.require_email_for_manual_pass
                  ? 'Lift Email Requirement'
                  : 'Enforce Email Requirement'}
            </button>
          </div>

          {/* Rule 2: Hourly Email Limit Override */}
          <div className="p-4 rounded-xl bg-surface-950/80 border border-surface-800 flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>⚡</span> Hourly Email Limit Override
                </span>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-extrabold border ${
                  systemSettings.hourly_email_override
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/30 animate-pulse'
                    : 'bg-surface-800 text-surface-400 border-surface-700'
                }`}>
                  {systemSettings.hourly_email_override ? 'ACTIVE (UP TO 550)' : 'STANDARD (70/HR)'}
                </span>
              </div>
              <p className="text-[11px] text-surface-400 mt-1">
                {systemSettings.hourly_email_override
                  ? '70 emails/hour ceiling is bypassed. Queue can be processed in consecutive batches up to the daily 550 limit.'
                  : 'Standard 70 emails/hour safety cap active on email dispatcher.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleToggleSystemSetting('hourly_email_override')}
              disabled={updatingSettingKey === 'hourly_email_override'}
              className={`w-full py-2 px-3 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50 ${
                systemSettings.hourly_email_override
                  ? 'bg-amber-500 hover:bg-amber-400 text-black font-extrabold shadow-amber-500/20'
                  : 'bg-primary-600 hover:bg-primary-500 text-white shadow-primary-600/20'
              }`}
            >
              {updatingSettingKey === 'hourly_email_override'
                ? 'Updating...'
                : systemSettings.hourly_email_override
                  ? 'Disable Hourly Override'
                  : 'Enable Hourly Override (550 Max)'}
            </button>
          </div>
        </div>
      </div>

      {/* Search & Stats Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search user by name, email, or role..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-surface-900 border border-surface-700 focus:border-primary-500 rounded-xl px-4 py-2.5 text-xs text-white placeholder-surface-500 focus:outline-none transition-all pl-9"
          />
          <span className="absolute left-3 top-2.5 text-surface-500 text-xs">🔍</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-surface-400 font-mono">
          <span>Total Admin Accounts:</span>
          <span className="px-2 py-0.5 rounded bg-surface-800 text-white font-bold">{users.length}</span>
        </div>
      </div>

      {/* Permissions Matrix Table */}
      <div className="card p-0 overflow-hidden border border-surface-700/60 shadow-xl bg-surface-900/90 backdrop-blur">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-surface-950/80 border-b border-surface-800 text-surface-400 uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-4 font-bold">Admin User</th>
                <th className="py-3.5 px-4 font-bold">Role</th>
                <th className="py-3.5 px-4 text-center font-bold">
                  <div className="flex flex-col items-center">
                    <span>📋 Audit Logs</span>
                    <span className="text-[9px] text-surface-500 font-normal lowercase">audit logs page</span>
                  </div>
                </th>
                <th className="py-3.5 px-4 text-center font-bold">
                  <div className="flex flex-col items-center">
                    <span>📷 Scanner Logs</span>
                    <span className="text-[9px] text-surface-500 font-normal lowercase">scanner logs page</span>
                  </div>
                </th>
                <th className="py-3.5 px-4 text-center font-bold">
                  <div className="flex flex-col items-center">
                    <span>⌨️ Manual Entry</span>
                    <span className="text-[9px] text-surface-500 font-normal lowercase">manual pass generation</span>
                  </div>
                </th>
                <th className="py-3.5 px-4 text-center font-bold">
                  <div className="flex flex-col items-center">
                    <span>👥 User Management</span>
                    <span className="text-[9px] text-surface-500 font-normal lowercase">invite & manage admins</span>
                  </div>
                </th>
                <th className="py-3.5 px-4 text-center font-bold">
                  <div className="flex flex-col items-center">
                    <span>🎟️ Scanned Passes</span>
                    <span className="text-[9px] text-surface-500 font-normal lowercase">admitted passes & count</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800/60">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-surface-500">
                    <div className="inline-block animate-spin mr-2">⏳</div> Loading permission matrix...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-surface-500">
                    No admin accounts found matching your search.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr
                    key={user.id}
                    className={`hover:bg-surface-800/40 transition-colors ${
                      user.is_pm ? 'bg-amber-500/[0.03]' : ''
                    }`}
                  >
                    {/* User Identity */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs ${
                          user.is_pm
                            ? 'bg-gradient-to-br from-amber-500 to-amber-600 text-black shadow-md shadow-amber-500/20'
                            : 'bg-surface-800 text-surface-300 border border-surface-700'
                        }`}>
                          {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                        </div>
                        <div>
                          <div className="font-semibold text-white flex items-center gap-1.5">
                            {user.name || 'Unnamed Admin'}
                            {user.is_pm && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-400 text-black font-extrabold uppercase">
                                Super Admin
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-surface-400 font-mono">{user.email}</div>
                        </div>
                      </div>
                    </td>

                    {/* Role Badge */}
                    <td className="py-3.5 px-4">
                      <span className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold bg-surface-800 border border-surface-700 text-surface-300">
                        {user.role}
                      </span>
                    </td>

                    {/* 1. Audit Logs Toggle */}
                    <td className="py-3.5 px-4 text-center">
                      {user.is_pm ? (
                        <span className="text-[10px] font-bold text-amber-400/90 font-mono">FULL ACCESS</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleToggle(user.id, 'audit_logs', user.custom_permissions.audit_logs)}
                          disabled={savingKey === `${user.id}-audit_logs`}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                            user.custom_permissions.audit_logs ? 'bg-primary-600' : 'bg-surface-800 border border-surface-700'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-md ${
                              user.custom_permissions.audit_logs ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      )}
                    </td>

                    {/* 2. Scanner Logs Toggle */}
                    <td className="py-3.5 px-4 text-center">
                      {user.is_pm ? (
                        <span className="text-[10px] font-bold text-amber-400/90 font-mono">FULL ACCESS</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleToggle(user.id, 'scanner_logs', user.custom_permissions.scanner_logs)}
                          disabled={savingKey === `${user.id}-scanner_logs`}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                            user.custom_permissions.scanner_logs ? 'bg-primary-600' : 'bg-surface-800 border border-surface-700'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-md ${
                              user.custom_permissions.scanner_logs ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      )}
                    </td>

                    {/* 3. Manual Pass Entry Toggle */}
                    <td className="py-3.5 px-4 text-center">
                      {user.is_pm ? (
                        <span className="text-[10px] font-bold text-amber-400/90 font-mono">FULL ACCESS</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleToggle(user.id, 'manual_entry', user.custom_permissions.manual_entry)}
                          disabled={savingKey === `${user.id}-manual_entry`}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                            user.custom_permissions.manual_entry ? 'bg-emerald-600' : 'bg-surface-800 border border-surface-700'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-md ${
                              user.custom_permissions.manual_entry ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      )}
                    </td>

                    {/* 4. User Management Toggle */}
                    <td className="py-3.5 px-4 text-center">
                      {user.is_pm ? (
                        <span className="text-[10px] font-bold text-amber-400/90 font-mono">FULL ACCESS</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleToggle(user.id, 'user_management', user.custom_permissions.user_management)}
                          disabled={savingKey === `${user.id}-user_management`}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                            user.custom_permissions.user_management ? 'bg-purple-600' : 'bg-surface-800 border border-surface-700'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-md ${
                              user.custom_permissions.user_management ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      )}
                    </td>

                    {/* 5. Scanned Passes Toggle */}
                    <td className="py-3.5 px-4 text-center">
                      {user.is_pm ? (
                        <span className="text-[10px] font-bold text-amber-400/90 font-mono">FULL ACCESS</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleToggle(user.id, 'scanned_passes', user.custom_permissions.scanned_passes)}
                          disabled={savingKey === `${user.id}-scanned_passes`}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                            user.custom_permissions.scanned_passes ? 'bg-cyan-600' : 'bg-surface-800 border border-surface-700'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-md ${
                              user.custom_permissions.scanned_passes ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
