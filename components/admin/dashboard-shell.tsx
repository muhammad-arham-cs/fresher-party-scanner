'use client';

import React, { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { AdminSession } from '@/lib/admin-auth';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  roles: string[];
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Gate Check-in',
    href: '/admin/dashboard/gate-checkin',
    roles: ['PROJECT_MANAGER', 'ENTRY_MANAGER', 'ENTRY_SUPERVISOR', 'SCANNER'],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    label: 'Excel Upload',
    href: '/admin/dashboard/excel-upload',
    roles: ['PROJECT_MANAGER', 'ENTRY_MANAGER', 'ENTRY_SUPERVISOR'],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
      </svg>
    ),
  },
  {
    label: 'Manual Entry',
    href: '/admin/dashboard/manual-entry',
    roles: ['PROJECT_MANAGER', 'ENTRY_MANAGER', 'ENTRY_SUPERVISOR'],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
      </svg>
    ),
  },
  {
    label: 'Pass Management',
    href: '/admin/dashboard/pass-management',
    roles: ['PROJECT_MANAGER', 'ENTRY_MANAGER', 'ENTRY_SUPERVISOR'],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
      </svg>
    ),
  },
  {
    label: 'Email Queue',
    href: '/admin/dashboard/email-queue',
    roles: ['PROJECT_MANAGER', 'ENTRY_MANAGER', 'ENTRY_SUPERVISOR'],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
      </svg>
    ),
  },
  {
    label: 'Scanner Logs',
    href: '/admin/dashboard/scanner-logs',
    roles: ['PROJECT_MANAGER', 'ENTRY_SUPERVISOR'],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
      </svg>
    ),
  },
  {
    label: 'Audit Logs',
    href: '/admin/dashboard/audit-logs',
    roles: ['PROJECT_MANAGER', 'ENTRY_SUPERVISOR', 'ENTRY_MANAGER'],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
  },
  {
    label: 'User Management',
    href: '/admin/dashboard/user-management',
    roles: ['PROJECT_MANAGER'],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
  },
  {
    label: 'Permission Matrix',
    href: '/admin/dashboard/permission-management',
    roles: ['PROJECT_MANAGER'],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
  },
];

const ROLE_BADGE_COLORS: Record<string, string> = {
  PROJECT_MANAGER: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  ENTRY_MANAGER: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  ENTRY_SUPERVISOR: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  SCANNER: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
};

export default function DashboardShell({
  admin,
  children,
}: {
  admin: AdminSession;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/admin/login');
  };

  const isPM = admin.role === 'PROJECT_MANAGER' || 
    admin.email?.toLowerCase() === 'muhammadarham979@gmail.com' || 
    admin.email?.toLowerCase() === 'arham.personal28@gmail.com';

  const accessibleNav = NAV_ITEMS.filter((item) => {
    // Project Manager has full access to all navigation items
    if (isPM) return true;

    // PM exclusive items
    if (item.href === '/admin/dashboard/permission-management') {
      return false;
    }

    // 4 Restricted features check dynamic per-user custom_permissions
    if (item.href === '/admin/dashboard/audit-logs') {
      return Boolean(admin.custom_permissions?.audit_logs);
    }
    if (item.href === '/admin/dashboard/scanner-logs') {
      return Boolean(admin.custom_permissions?.scanner_logs);
    }
    if (item.href === '/admin/dashboard/manual-entry') {
      return Boolean(admin.custom_permissions?.manual_entry);
    }
    if (item.href === '/admin/dashboard/user-management') {
      return Boolean(admin.custom_permissions?.user_management);
    }

    // Other items check standard role assignment
    return item.roles.includes(admin.role);
  });

  return (
    <div className="min-h-screen flex bg-surface-950 text-white">
      {/* Sidebar for Desktop */}
      <aside className="hidden lg:flex w-64 flex-col bg-surface-900 border-r border-surface-800">
        {/* Brand */}
        <div className="p-6 border-b border-surface-800">
          <Link href="/admin/dashboard" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center font-bold text-white shadow-lg shadow-primary-500/20">
              FP
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Fresher Party 2026</h2>
              <p className="text-xs text-surface-400">Campus of I&CS · DUET</p>
            </div>
          </Link>
        </div>

        {/* User Card */}
        <div className="p-4 mx-3 my-3 rounded-2xl bg-surface-800/60 border border-surface-700/50">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-white truncate max-w-[130px]">{admin.name}</p>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${ROLE_BADGE_COLORS[admin.role] || ''}`}>
              {admin.role.replace('_', ' ')}
            </span>
          </div>
          <p className="text-[11px] text-surface-400 truncate">{admin.email}</p>
          <p className="text-[10px] text-amber-400/80 mt-1">⏱️ Session: 1 hr timeout</p>
        </div>

        {/* Nav list */}
        <nav className="flex-1 px-3 space-y-1">
          {accessibleNav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  active
                    ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/25'
                    : 'text-surface-400 hover:text-white hover:bg-surface-800'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-surface-800">
          <Button
            variant="ghost"
            onClick={handleLogout}
            className="w-full justify-start text-danger-400 hover:text-danger-300 hover:bg-danger-500/10"
          >
            🚪 Logout
          </Button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navbar */}
        <header className="h-16 border-b border-surface-800 bg-surface-900/60 backdrop-blur px-6 flex items-center justify-between sticky top-0 z-30">
          <button
            onClick={() => setSidebarOpen((prev) => !prev)}
            className="lg:hidden p-2 rounded-lg text-surface-400 hover:text-white hover:bg-surface-800"
          >
            ☰
          </button>
          <div className="flex items-center gap-3">
            <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              🟢 System Online
            </span>
          </div>
        </header>

        {/* Mobile Sidebar Overlay */}
        {sidebarOpen && (
          <div className="lg:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex">
            <div className="w-64 bg-surface-900 h-full p-4 flex flex-col">
              <div className="flex items-center justify-between pb-4 border-b border-surface-800 mb-4">
                <span className="font-bold text-sm">Fresher Party 2026</span>
                <button onClick={() => setSidebarOpen(false)} className="text-surface-400 hover:text-white">✕</button>
              </div>
              <nav className="flex-1 space-y-1">
                {accessibleNav.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-surface-300 hover:bg-surface-800"
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </Link>
                ))}
              </nav>
              <Button variant="ghost" onClick={handleLogout} className="text-danger-400 justify-start">
                Logout
              </Button>
            </div>
            <div className="flex-1" onClick={() => setSidebarOpen(false)} />
          </div>
        )}

        {/* Page Content */}
        <main className="flex-1 p-6 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
