import { NextRequest, NextResponse } from 'next/server';
import { checkAdminSession, isPMEmail } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase';
import { logAuditEvent } from '@/lib/audit';

export async function POST(req: NextRequest) {
  try {
    const session = await checkAdminSession();
    if (!session || session.role !== 'PROJECT_MANAGER') {
      return NextResponse.json({ success: false, message: 'Access denied' }, { status: 403 });
    }

    const { user_id } = await req.json();
    if (!user_id) return NextResponse.json({ success: false, message: 'user_id required' }, { status: 400 });

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
      return NextResponse.json({ success: false, message: 'Cannot revoke a Project Manager or your own account' }, { status: 400 });
    }

    const { error } = await supabase
      .from('admin_users')
      .update({ is_active: false })
      .eq('id', user_id);

    if (error) throw error;

    await logAuditEvent({
      action_type: 'admin_user_revoked',
      performed_by: session.email,
      user_role: session.role,
      student_name: targetUser.name,
      details: { revoked_user_id: user_id, revoked_email: targetUser.email },
    });

    return NextResponse.json({ success: true, message: `Access revoked for ${targetUser.name}` });
  } catch (err) {
    console.error('Revoke user error:', err);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}
