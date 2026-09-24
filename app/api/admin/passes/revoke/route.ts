import { NextRequest, NextResponse } from 'next/server';
import { checkAdminSession, hasPermission } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase';
import { logAuditEvent } from '@/lib/audit';

export async function POST(req: NextRequest) {
  try {
    const session = await checkAdminSession();
    if (!session) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(session.role, 'pass_management')) {
      return NextResponse.json({ success: false, message: 'Access denied: pass_management permission required' }, { status: 403 });
    }

    const { pass_id, action } = await req.json();
    if (!pass_id) {
      return NextResponse.json({ success: false, message: 'Pass ID is required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: pass, error: fetchErr } = await supabase
      .from('approved_passes')
      .select('id, name, roll_no, email, pass_status, pass_sent_at, ticket_id')
      .eq('id', pass_id)
      .maybeSingle();

    if (fetchErr || !pass) {
      return NextResponse.json({ success: false, message: 'Pass not found' }, { status: 404 });
    }

    let newStatus: string;
    let auditAction: 'pass_revoked' | 'pass_restored';

    if (action === 'restore' || (action === undefined && pass.pass_status === 'revoked')) {
      // Restore pass
      newStatus = pass.pass_sent_at ? 'email_sent' : 'generated';
      auditAction = 'pass_restored';
    } else {
      // Revoke pass
      newStatus = 'revoked';
      auditAction = 'pass_revoked';
    }

    const { error: updateErr } = await supabase
      .from('approved_passes')
      .update({ pass_status: newStatus })
      .eq('id', pass.id);

    if (updateErr) throw updateErr;

    // Log in audit_logs
    await logAuditEvent({
      action_type: auditAction,
      performed_by: session.email,
      user_role: session.role,
      roll_no: pass.roll_no,
      student_name: pass.name,
      details: {
        pass_id: pass.id,
        ticket_id: pass.ticket_id,
        previous_status: pass.pass_status,
        new_status: newStatus,
      },
    });

    const actionText = newStatus === 'revoked' ? 'revoked' : 'restored';
    return NextResponse.json({
      success: true,
      pass_status: newStatus,
      message: `Pass for ${pass.name} (${pass.roll_no}) has been ${actionText}.`,
    });
  } catch (err) {
    console.error('Revoke/Restore pass error:', err);
    return NextResponse.json({ success: false, message: 'Server error processing pass status change' }, { status: 500 });
  }
}
