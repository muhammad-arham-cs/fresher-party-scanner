'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatPKTDateTime } from '@/lib/date-utils';

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
  created_at: string;
  last_login: string | null;
  created_by: string | null;
  password_setup_token?: string | null;
  password_setup_expires?: string | null;
}

const ROLES = ['ENTRY_MANAGER', 'ENTRY_SUPERVISOR', 'PROJECT_MANAGER'];
const ROLE_LABELS: Record<string, string> = {
  PROJECT_MANAGER: 'President (PM)',
  ENTRY_MANAGER: 'Entry Manager',
  ENTRY_SUPERVISOR: 'Supervisor',
  SCANNER: 'Gate Volunteer',
};

function getUserStatus(user: AdminUser) {
  if (!user.is_active) {
    return { label: 'Revoked', badgeClass: 'badge-danger' };
  }
  // User is ONLY active once they have set up their password AND logged in for the first time
  if (user.password_setup_token || !user.last_login) {
    return { label: 'Pending Setup', badgeClass: 'bg-amber-500/10 text-amber-400 border border-amber-500/30' };
  }
  return { label: 'Active', badgeClass: 'badge-success' };
}

export default function UserManagementPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', name: '', role: 'ENTRY_MANAGER' });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');
  const [invitedResult, setInvitedResult] = useState<{ email: string; setup_url: string; reactivated?: boolean } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [revokeLoading, setRevokeLoading] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (data.success) setUsers(data.users);
    } catch {/* ignore */} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.email || !newUser.name) { setAddError('Email and name are required'); return; }
    setAddLoading(true);
    setAddError('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      });
      const data = await res.json();
      if (data.success) {
        setInvitedResult({ email: newUser.email, setup_url: data.setup_url, reactivated: !!data.reactivated });
        setNewUser({ email: '', name: '', role: 'ENTRY_MANAGER' });
        await fetchUsers();
      } else {
        setAddError(data.message || 'Failed to add user');
      }
    } catch {
      setAddError('Network error');
    } finally { setAddLoading(false); }
  };

  const handleResend = async (user: AdminUser) => {
    setResendingId(user.id);
    try {
      const res = await fetch('/api/admin/users/resend-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id }),
      });
      const data = await res.json();
      if (data.success) {
        setFeedbackMessage(`✅ ${data.message}`);
        await fetchUsers();
      } else {
        alert(data.message || 'Failed to resend invite');
      }
    } catch {
      alert('Network error resending invite');
    } finally {
      setResendingId(null);
    }
  };

  const copyUserSetupLink = (token: string | null | undefined) => {
    if (!token) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const link = `${origin}/admin/onboarding?token=${token}`;
    navigator.clipboard.writeText(link);
    setFeedbackMessage('📋 Setup link copied to clipboard!');
  };

  const handleRevoke = async (userId: string, userName: string) => {
    if (!confirm(`Revoke access for ${userName}? They will not be able to login.`)) return;
    setRevokeLoading(userId);
    try {
      const res = await fetch('/api/admin/revoke-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      const data = await res.json();
      if (data.success) {
        setFeedbackMessage(`🔒 Access revoked for ${userName}`);
        await fetchUsers();
      } else {
        alert(data.message || 'Failed to revoke user');
      }
    } catch {
      alert('Network error revoking user');
    } finally { setRevokeLoading(null); }
  };

  const handleDelete = async (userId: string, userName: string, userEmail: string) => {
    if (!confirm(`Are you sure you want to permanently delete "${userName}" (${userEmail})?\n\nThis will remove their record completely from the database so you can re-add them if needed.`)) return;
    setDeleteLoading(userId);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      const data = await res.json();
      if (data.success) {
        setFeedbackMessage(`🗑️ ${data.message || 'User deleted permanently'}`);
        await fetchUsers();
      } else {
        alert(data.message || 'Failed to delete user');
      }
    } catch {
      alert('Network error deleting user');
    } finally { setDeleteLoading(null); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="section-title">User Management</h1>
          <p className="section-subtitle">Manage admin access. Only the President can add or revoke users.</p>
        </div>
        <Button onClick={() => { setShowModal(true); setInvitedResult(null); setAddError(''); }} id="add-admin-btn">
          + Add Admin
        </Button>
      </div>

      {feedbackMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm flex items-center justify-between animate-fade-in">
          <span>{feedbackMessage}</span>
          <button onClick={() => setFeedbackMessage(null)} className="ml-3 font-bold hover:opacity-75">✕</button>
        </div>
      )}

      {/* Users table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>Added By</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12 text-surface-400">Loading users...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-surface-500">No admin users found</td></tr>
              ) : (
                users.map((user) => {
                  const status = getUserStatus(user);
                  const isPending = user.is_active && (user.password_setup_token || !user.last_login);
                  return (
                    <tr key={user.id}>
                      <td className="font-semibold text-white">{user.name}</td>
                      <td className="text-surface-400 text-xs">{user.email}</td>
                      <td><span className="badge badge-primary">{ROLE_LABELS[user.role] || user.role}</span></td>
                      <td>
                        <span className={`badge ${status.badgeClass}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="text-surface-400 text-xs">
                        {user.last_login ? formatPKTDateTime(user.last_login, false) : 'Never'}
                      </td>
                      <td className="text-surface-500 text-xs">{user.created_by || 'System'}</td>
                      <td>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {isPending && user.password_setup_token && (
                            <button
                              onClick={() => copyUserSetupLink(user.password_setup_token)}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-primary-600/20 text-primary-300 hover:bg-primary-600/30 transition-colors"
                              title="Copy onboarding setup link"
                            >
                              📋 Copy Link
                            </button>
                          )}
                          {isPending && (
                            <button
                              onClick={() => handleResend(user)}
                              disabled={resendingId === user.id}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-surface-800 text-surface-300 hover:bg-surface-700 transition-colors disabled:opacity-50"
                              title="Resend invitation email"
                            >
                              {resendingId === user.id ? '⏳ ...' : '📧 Resend'}
                            </button>
                          )}
                          {user.is_active && (
                            <Button
                              variant="danger"
                              size="sm"
                              loading={revokeLoading === user.id}
                              onClick={() => handleRevoke(user.id, user.name)}
                              id={`revoke-${user.id}`}
                            >
                              Revoke
                            </Button>
                          )}
                          {!user.is_active && (
                            <>
                              <button
                                onClick={() => handleResend(user)}
                                disabled={resendingId === user.id}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
                                title="Reactivate account and dispatch fresh invite link"
                              >
                                {resendingId === user.id ? '⏳ ...' : '🔄 Reactivate'}
                              </button>
                              <button
                                onClick={() => handleDelete(user.id, user.name, user.email)}
                                disabled={deleteLoading === user.id}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 transition-colors disabled:opacity-50"
                                title="Permanently delete user record"
                              >
                                {deleteLoading === user.id ? '⏳ ...' : '🗑️ Delete'}
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

      {/* Add Admin Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-surface-900 border border-surface-700 rounded-2xl p-6 w-full max-w-md animate-scale-in">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Add New Admin</h2>
              <button
                onClick={() => { setShowModal(false); setAddError(''); setInvitedResult(null); }}
                className="text-surface-400 hover:text-white text-xl"
              >
                ×
              </button>
            </div>

            {invitedResult ? (
              <div className="space-y-4 py-2">
                <div className="text-center">
                  <div className="text-4xl mb-2">🎉</div>
                  <p className="text-success-400 font-bold text-lg">
                    {invitedResult.reactivated ? 'Admin Reactivated!' : 'Admin Invited!'}
                  </p>
                  <p className="text-surface-300 text-sm">
                    Invitation email dispatched to <strong className="text-white">{invitedResult.email}</strong>.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-surface-800 border border-surface-700 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-surface-400 uppercase tracking-wide">Setup Link (15-Minute Expiry)</span>

                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(invitedResult.setup_url);
                        setLinkCopied(true);
                        setTimeout(() => setLinkCopied(false), 2000);
                      }}
                      className="text-xs text-primary-400 hover:text-primary-300 font-semibold flex items-center gap-1"
                    >
                      {linkCopied ? '✅ Copied!' : '📋 Copy Link'}
                    </button>
                  </div>
                  <p className="text-xs font-mono text-primary-300 break-all select-all bg-surface-900/60 p-2 rounded-lg border border-surface-700/50">
                    {invitedResult.setup_url}
                  </p>
                </div>

                <p className="text-surface-400 text-xs text-center">
                  💡 Tip: If they don&apos;t see the email, advise checking their Spam / Promotions folder, or share the onboarding link directly.
                </p>

                <div className="pt-2 flex justify-center">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setShowModal(false);
                      setInvitedResult(null);
                    }}
                  >
                    Done
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleAddUser} className="space-y-4">
                {addError && <div className="p-3 rounded-xl bg-danger-500/10 border border-danger-500/30 text-danger-400 text-sm">{addError}</div>}
                <Input label="Full Name" value={newUser.name} onChange={(e) => setNewUser((p) => ({ ...p, name: e.target.value }))} placeholder="Full Name" required id="nu-name" />
                <Input label="Email" type="email" value={newUser.email} onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))} placeholder="your@email.com" required id="nu-email" />
                <div className="form-group">
                  <label className="form-label">Role</label>
                  <select className="form-input" value={newUser.role} onChange={(e) => setNewUser((p) => ({ ...p, role: e.target.value }))} id="nu-role">
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                </div>
                <div className="flex gap-3 pt-2">
                  <Button type="submit" loading={addLoading} className="flex-1" id="nu-submit">Send Invite</Button>
                  <Button type="button" variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

