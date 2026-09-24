import React from 'react';
import { checkAdminSession, getLiveAdminPermissions } from '@/lib/admin-auth';
import { redirect } from 'next/navigation';
import DashboardShell from '@/components/admin/dashboard-shell';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await checkAdminSession();

  if (!session) {
    redirect('/admin/login');
  }

  const livePerms = await getLiveAdminPermissions(session.id);
  const adminWithPerms = { ...session, custom_permissions: livePerms };

  return <DashboardShell admin={adminWithPerms}>{children}</DashboardShell>;
}
