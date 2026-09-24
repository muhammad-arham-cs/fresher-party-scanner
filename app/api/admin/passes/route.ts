import { NextRequest, NextResponse } from 'next/server';
import { checkAdminSession, hasPermission } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase';
import { logAuditEvent } from '@/lib/audit';

export async function GET(req: NextRequest) {
  try {
    const session = await checkAdminSession();
    if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || 'all';
    const search = searchParams.get('search') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;

    const supabase = createAdminClient();
    let query = supabase
      .from('approved_passes')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status !== 'all') query = query.eq('pass_status', status);
    if (search) query = query.or(`roll_no.ilike.%${search}%,name.ilike.%${search}%,section.ilike.%${search}%`);

    const { data, count, error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true, passes: data, total: count });
  } catch (err) {
    console.error('Get passes error:', err);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await checkAdminSession();
    if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

    if (!hasPermission(session.role, 'pass_management')) {
      return NextResponse.json({ success: false, message: 'Access denied: pass_management permission required' }, { status: 403 });
    }

    const { pass_id } = await req.json();
    if (!pass_id) {
      return NextResponse.json({ success: false, message: 'Pass ID is required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // 1. Fetch pass
    const { data: pass, error: fetchErr } = await supabase
      .from('approved_passes')
      .select('id, name, roll_no, email, qr_token, section')
      .eq('id', pass_id)
      .maybeSingle();

    if (fetchErr || !pass) {
      return NextResponse.json({ success: false, message: 'Pass not found' }, { status: 404 });
    }

    // 2. Clean up foreign keys / references in scan_audit and email_queue
    if (pass.qr_token) {
      await supabase.from('scan_audit').delete().eq('qr_token', pass.qr_token);
    }
    await supabase.from('scan_audit').delete().eq('approved_pass_id', pass.id);
    await supabase.from('email_queue').delete().eq('approved_pass_id', pass.id);

    // 3. Delete the pass record
    const { error: delErr } = await supabase
      .from('approved_passes')
      .delete()
      .eq('id', pass.id);

    if (delErr) throw delErr;

    // 4. Log audit event
    await logAuditEvent({
      action_type: 'pass_deleted',
      performed_by: session.email,
      user_role: session.role,
      roll_no: pass.roll_no,
      student_name: pass.name,
      details: {
        pass_id: pass.id,
        roll_no: pass.roll_no,
        ticket_id: pass.section,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Pass for ${pass.name} (${pass.roll_no}) permanently deleted. You can now re-generate it.`,
    });
  } catch (err) {
    console.error('Delete pass error:', err);
    return NextResponse.json({ success: false, message: 'Server error deleting pass' }, { status: 500 });
  }
}

