import { NextRequest, NextResponse } from 'next/server';
import { checkAdminSession } from '@/lib/admin-auth';
import { getPassDownloadSignedUrl } from '@/lib/pass-generator';
import { logAuditEvent } from '@/lib/audit';
import { createAdminClient } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const session = await checkAdminSession();
    if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const rollNo = searchParams.get('roll_no');

    if (!rollNo) {
      return NextResponse.json({ success: false, message: 'Roll number is required' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: pass } = await supabase
      .from('approved_passes')
      .select('roll_no, name')
      .eq('roll_no', rollNo.trim())
      .maybeSingle();

    if (!pass) {
      return NextResponse.json({ success: false, message: 'Pass not found' }, { status: 404 });
    }

    const signedUrl = await getPassDownloadSignedUrl(pass.roll_no);
    if (!signedUrl) {
      return NextResponse.json({ success: false, message: 'Could not generate pass download link' }, { status: 500 });
    }

    // Security Update #8: Log pass download action
    await logAuditEvent({
      action_type: 'pass_downloaded',
      performed_by: session.email,
      user_role: session.role,
      roll_no: pass.roll_no,
      student_name: pass.name,
      details: { requested_by_role: session.role },
    });

    return NextResponse.json({
      success: true,
      url: signedUrl,
      roll_no: pass.roll_no,
      name: pass.name,
    });
  } catch (err) {
    console.error('Download pass error:', err);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}
