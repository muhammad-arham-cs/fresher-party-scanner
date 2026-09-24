import { NextRequest, NextResponse } from 'next/server';
import { checkAdminSession, hashPassword, getBaseUrl, isPMEmail, getLiveAdminPermissions } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase';
import { sendAdminInviteEmail } from '@/lib/brevo';
import { logAuditEvent } from '@/lib/audit';
import { v4 as uuidv4 } from 'uuid';

export async function GET() {
  try {
    const session = await checkAdminSession();
    if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

    const isPM = session.role === 'PROJECT_MANAGER' || isPMEmail(session.email);
    let hasUserMgmt = isPM;
    if (!hasUserMgmt) {
      const livePerms = await getLiveAdminPermissions(session.id);
      hasUserMgmt = Boolean(livePerms.user_management);
    }
    if (!hasUserMgmt) {
      return NextResponse.json({ success: false, message: 'Access denied: User management permission required' }, { status: 403 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('admin_users')
      .select('id, email, name, role, is_active, created_at, last_login, created_by, password_setup_token, password_setup_expires')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ success: true, users: data });
  } catch (err) {
    console.error('List users error:', err);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await checkAdminSession();
    if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

    const isPM = session.role === 'PROJECT_MANAGER' || isPMEmail(session.email);
    let hasUserMgmt = isPM;
    if (!hasUserMgmt) {
      const livePerms = await getLiveAdminPermissions(session.id);
      hasUserMgmt = Boolean(livePerms.user_management);
    }
    if (!hasUserMgmt) {
      return NextResponse.json({ success: false, message: 'Access denied: User management permission required' }, { status: 403 });
    }

    const { email, name, role } = await req.json();
    if (!email || !name || !role) {
      return NextResponse.json({ success: false, message: 'Email, name, and role are required' }, { status: 400 });
    }

    // Only PM can invite another PM
    if (role === 'PROJECT_MANAGER' && !isPM) {
      return NextResponse.json({ success: false, message: 'Only a Project Manager can invite Project Managers' }, { status: 403 });
    }

    const validRoles = ['ENTRY_MANAGER', 'ENTRY_SUPERVISOR', 'PROJECT_MANAGER'];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ success: false, message: 'Invalid role' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Check if user already exists
    const { data: existing } = await supabase
      .from('admin_users')
      .select('id, email, name, role, is_active')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (existing && existing.is_active) {
      return NextResponse.json({
        success: false,
        message: 'An active user with this email already exists. Use "Resend Invite" or copy their setup link if they need access.',
      }, { status: 409 });
    }

    // Generate password setup token with 15-minute expiration
    const setupToken = uuidv4();
    const setupExpires = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes
    const tempHash = await hashPassword(uuidv4());
    const baseUrl = getBaseUrl(req);
    const setupUrl = `${baseUrl}/admin/onboarding?token=${setupToken}`;

    let targetUser;

    if (existing && !existing.is_active) {
      // Reactivate previously revoked user
      const { data: updatedUser, error: updateError } = await supabase
        .from('admin_users')
        .update({
          name,
          role,
          password_hash: tempHash,
          password_setup_token: setupToken,
          password_setup_expires: setupExpires,
          is_active: true,
          last_login: null,
          created_by: session.email,
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (updateError) throw updateError;
      targetUser = updatedUser;
    } else {
      // Brand new user
      const { data: newUser, error: insertError } = await supabase
        .from('admin_users')
        .insert({
          email: email.toLowerCase(),
          name,
          role,
          password_hash: tempHash,
          password_setup_token: setupToken,
          password_setup_expires: setupExpires,
          is_active: true,
          created_by: session.email,
        })
        .select()
        .single();

      if (insertError) throw insertError;
      targetUser = newUser;
    }

    const emailResult = await sendAdminInviteEmail({ to: email, name, role, setupUrl });

    // Log admin invitation or reactivation in audit_logs
    await logAuditEvent({
      action_type: existing ? 'admin_user_reactivated' : 'admin_user_invited',
      performed_by: session.email,
      user_role: session.role,
      student_name: name,
      details: {
        invited_email: email,
        role,
        reactivated: !!existing,
        email_sent: emailResult.success,
        error: emailResult.error || null,
      },
    });

    return NextResponse.json({
      success: true,
      user: targetUser,
      setup_url: setupUrl,
      email_sent: emailResult.success,
      email_error: emailResult.error || null,
      reactivated: !!existing,
      message: existing
        ? `Account reactivated and invite email sent to ${email}!`
        : `Admin invited and email sent to ${email}!`,
    });
  } catch (err) {
    console.error('Add user error:', err);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await checkAdminSession();
    if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

    const isPM = session.role === 'PROJECT_MANAGER' || isPMEmail(session.email);
    let hasUserMgmt = isPM;
    if (!hasUserMgmt) {
      const livePerms = await getLiveAdminPermissions(session.id);
      hasUserMgmt = Boolean(livePerms.user_management);
    }
    if (!hasUserMgmt) {
      return NextResponse.json({ success: false, message: 'Access denied: User management permission required' }, { status: 403 });
    }

    const { user_id } = await req.json();
    if (!user_id) {
      return NextResponse.json({ success: false, message: 'User ID is required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: targetUser, error: fetchErr } = await supabase
      .from('admin_users')
      .select('id, email, name, role')
      .eq('id', user_id)
      .maybeSingle();

    if (fetchErr || !targetUser) {
      return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
    }

    if (isPMEmail(targetUser.email) || targetUser.email.toLowerCase() === session.email.toLowerCase()) {
      return NextResponse.json({ success: false, message: 'Cannot delete a Project Manager or your own account' }, { status: 400 });
    }

    const { error: deleteErr } = await supabase
      .from('admin_users')
      .delete()
      .eq('id', user_id);

    if (deleteErr) throw deleteErr;

    await logAuditEvent({
      action_type: 'admin_user_deleted',
      performed_by: session.email,
      user_role: session.role,
      student_name: targetUser.name,
      details: {
        deleted_user_id: user_id,
        deleted_email: targetUser.email,
        role: targetUser.role,
      },
    });

    return NextResponse.json({
      success: true,
      message: `User ${targetUser.name} (${targetUser.email}) permanently deleted.`,
    });
  } catch (err) {
    console.error('Delete user error:', err);
    return NextResponse.json({ success: false, message: 'Server error deleting user' }, { status: 500 });
  }
}
