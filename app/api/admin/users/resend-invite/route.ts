import { NextRequest, NextResponse } from 'next/server';
import { checkAdminSession, getBaseUrl } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase';
import { sendAdminInviteEmail } from '@/lib/brevo';
import { logAuditEvent } from '@/lib/audit';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: NextRequest) {
  try {
    const session = await checkAdminSession();
    if (!session || session.role !== 'PROJECT_MANAGER') {
      return NextResponse.json({ success: false, message: 'Access denied' }, { status: 403 });
    }

    const { user_id, email } = await req.json();
    if (!user_id && !email) {
      return NextResponse.json({ success: false, message: 'User ID or email is required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    let query = supabase.from('admin_users').select('*');
    if (user_id) query = query.eq('id', user_id);
    else if (email) query = query.eq('email', email.toLowerCase());

    const { data: user, error: fetchErr } = await query.maybeSingle();

    if (fetchErr || !user) {
      return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
    }

    const isReactivating = !user.is_active;

    // Refresh token with 24-hour expiration and ensure account is active
    const setupToken = uuidv4();
    const setupExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error: updateErr } = await supabase
      .from('admin_users')
      .update({
        password_setup_token: setupToken,
        password_setup_expires: setupExpires,
        is_active: true,
        last_login: null,
      })
      .eq('id', user.id);

    if (updateErr) throw updateErr;

    const baseUrl = getBaseUrl(req);
    const setupUrl = `${baseUrl}/admin/onboarding?token=${setupToken}`;

    const emailResult = await sendAdminInviteEmail({
      to: user.email,
      name: user.name,
      role: user.role,
      setupUrl,
    });

    await logAuditEvent({
      action_type: isReactivating ? 'admin_user_reactivated' : 'admin_user_invited',
      performed_by: session.email,
      user_role: session.role,
      student_name: user.name,
      details: {
        invited_email: user.email,
        role: user.role,
        is_resend: !isReactivating,
        reactivated: isReactivating,
        email_sent: emailResult.success,
      },
    });

    const successMsg = isReactivating
      ? `Account reactivated and invitation sent to ${user.email}!`
      : `Invite resent to ${user.email}!`;

    return NextResponse.json({
      success: true,
      message: emailResult.success
        ? successMsg
        : `New link generated, but email delivery issue: ${emailResult.error || 'Provider issue'}. Copy link manually.`,
      setup_url: setupUrl,
      email_sent: emailResult.success,
      reactivated: isReactivating,
    });
  } catch (err) {
    console.error('Resend invite error:', err);
    return NextResponse.json({ success: false, message: 'Server error resending invite' }, { status: 500 });
  }
}
