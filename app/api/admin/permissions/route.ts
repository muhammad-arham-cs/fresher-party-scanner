import { NextRequest, NextResponse } from 'next/server';
import { checkAdminSession, isPMEmail } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase';
import { logAuditEvent } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/permissions
 * PM-only: Lists all admin users and their current dynamic permissions.
 */
export async function GET() {
  const session = await checkAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  const isPM = session.role === 'PROJECT_MANAGER' || isPMEmail(session.email);
  if (!isPM) {
    return NextResponse.json({ success: false, message: 'Access denied: Project Manager only' }, { status: 403 });
  }

  const supabase = createAdminClient();
  const { data: users, error } = await supabase
    .from('admin_users')
    .select('id, name, email, role, is_active, custom_permissions, last_login, created_at')
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  const sanitizedUsers = (users || []).map((u) => {
    const userIsPM = u.role === 'PROJECT_MANAGER' || isPMEmail(u.email);
    const perms = userIsPM
      ? { audit_logs: true, scanner_logs: true, manual_entry: true, user_management: true }
      : {
          audit_logs: Boolean(u.custom_permissions?.audit_logs),
          scanner_logs: Boolean(u.custom_permissions?.scanner_logs),
          manual_entry: Boolean(u.custom_permissions?.manual_entry),
          user_management: Boolean(u.custom_permissions?.user_management),
        };

    return {
      ...u,
      is_pm: userIsPM,
      custom_permissions: perms,
    };
  });

  return NextResponse.json({ success: true, users: sanitizedUsers });
}

/**
 * POST /api/admin/permissions
 * PM-only: Updates a specific user's custom permissions.
 */
export async function POST(req: NextRequest) {
  const session = await checkAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  const isPM = session.role === 'PROJECT_MANAGER' || isPMEmail(session.email);
  if (!isPM) {
    return NextResponse.json({ success: false, message: 'Access denied: Project Manager only' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { userId, permission, enabled, custom_permissions } = body;

    if (!userId) {
      return NextResponse.json({ success: false, message: 'Missing userId' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: targetUser } = await supabase
      .from('admin_users')
      .select('id, email, role, custom_permissions')
      .eq('id', userId)
      .maybeSingle();

    if (!targetUser) {
      return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
    }

    if (targetUser.role === 'PROJECT_MANAGER' || isPMEmail(targetUser.email)) {
      return NextResponse.json({ success: false, message: 'Cannot modify Project Manager permissions' }, { status: 400 });
    }

    let updatedPerms = {
      audit_logs: Boolean(targetUser.custom_permissions?.audit_logs),
      scanner_logs: Boolean(targetUser.custom_permissions?.scanner_logs),
      manual_entry: Boolean(targetUser.custom_permissions?.manual_entry),
      user_management: Boolean(targetUser.custom_permissions?.user_management),
    };

    if (custom_permissions && typeof custom_permissions === 'object') {
      updatedPerms = {
        audit_logs: Boolean(custom_permissions.audit_logs),
        scanner_logs: Boolean(custom_permissions.scanner_logs),
        manual_entry: Boolean(custom_permissions.manual_entry),
        user_management: Boolean(custom_permissions.user_management),
      };
    } else if (permission) {
      if (!['audit_logs', 'scanner_logs', 'manual_entry', 'user_management'].includes(permission)) {
        return NextResponse.json({ success: false, message: 'Invalid permission key' }, { status: 400 });
      }
      updatedPerms[permission as keyof typeof updatedPerms] = Boolean(enabled);
    }

    const { error: updateError } = await supabase
      .from('admin_users')
      .update({ custom_permissions: updatedPerms })
      .eq('id', userId);

    if (updateError) {
      return NextResponse.json({ success: false, message: updateError.message }, { status: 500 });
    }

    // Log to audit logs (tagged as PM action so it remains confidential to PM)
    await logAuditEvent({
      action_type: 'manual_entry_created' as any,
      performed_by: session.email,
      user_role: session.role,
      details: {
        action: 'UPDATE_USER_PERMISSIONS',
        target_user: targetUser.email,
        updated_permissions: updatedPerms,
      },
    });

    return NextResponse.json({
      success: true,
      userId,
      custom_permissions: updatedPerms,
      message: `Permissions updated successfully for ${targetUser.email}`,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message || 'Server error' }, { status: 500 });
  }
}
