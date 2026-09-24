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

    const { pass_id, roll_no, action } = await req.json();
    if (!pass_id && !roll_no) {
      return NextResponse.json({ success: false, message: 'Pass ID or Roll Number is required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    let query = supabase.from('approved_passes').select('id, name, roll_no, email, pass_status, pass_sent_at, section');
    if (pass_id) {
      query = query.eq('id', pass_id);
    } else if (roll_no) {
      query = query.eq('roll_no', roll_no.trim());
    }

    let { data: pass, error: fetchErr } = await query.maybeSingle();

    // Defensive fallback in case schema has drifted
    if (fetchErr || !pass) {
      let retryQuery = supabase.from('approved_passes').select('*');
      if (pass_id) retryQuery = retryQuery.eq('id', pass_id);
      else if (roll_no) retryQuery = retryQuery.eq('roll_no', roll_no.trim());
      const retry = await retryQuery.maybeSingle();
      pass = retry.data;
      fetchErr = retry.error;
    }

    if (fetchErr || !pass) {
      console.error('Pass lookup failed in revoke route:', fetchErr);
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
        ticket_id: pass.section,
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
