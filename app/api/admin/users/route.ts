import { NextRequest, NextResponse } from 'next/server';
import { checkAdminSession, hashPassword, getBaseUrl } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase';
import { sendAdminInviteEmail } from '@/lib/brevo';
import { logAuditEvent } from '@/lib/audit';
import { v4 as uuidv4 } from 'uuid';


export async function GET() {
  try {
    const session = await checkAdminSession();
    if (!session || session.role !== 'PROJECT_MANAGER') {
      return NextResponse.json({ success: false, message: 'Access denied' }, { status: 403 });
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
    if (!session || session.role !== 'PROJECT_MANAGER') {
      return NextResponse.json({ success: false, message: 'Access denied' }, { status: 403 });
    }

    const { email, name, role } = await req.json();
    if (!email || !name || !role) {
      return NextResponse.json({ success: false, message: 'Email, name, and role are required' }, { status: 400 });
    }

    const validRoles = ['ENTRY_MANAGER', 'ENTRY_SUPERVISOR', 'PROJECT_MANAGER'];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ success: false, message: 'Invalid role' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Check if user already exists
    const { data: existing } = await supabase
      .from('admin_users')
      .select('id')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ success: false, message: 'User with this email already exists' }, { status: 409 });
    }

    // Generate password setup token with 24-hour expiration
    const setupToken = uuidv4();
    const setupExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

    const tempHash = await hashPassword(uuidv4());

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

    // Send invite email with tokenized setup link (dynamically derived to avoid localhost leaks)
    const baseUrl = getBaseUrl(req);
    const setupUrl = `${baseUrl}/admin/onboarding?token=${setupToken}`;

    const emailResult = await sendAdminInviteEmail({ to: email, name, role, setupUrl });

    // Log admin invitation in audit_logs
    await logAuditEvent({
      action_type: 'admin_user_invited',
      performed_by: session.email,
      user_role: session.role,
      student_name: name,
      details: {
        invited_email: email,
        role,
        email_sent: emailResult.success,
        error: emailResult.error || null,
      },
    });

    return NextResponse.json({
      success: true,
      user: newUser,
      setup_url: setupUrl,
      email_sent: emailResult.success,
      email_error: emailResult.error || null,
    });
  } catch (err) {
    console.error('Add user error:', err);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}
