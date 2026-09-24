import { NextRequest, NextResponse } from 'next/server';
import { checkAdminSession, getLiveAdminPermissions, isPMEmail } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const session = await checkAdminSession();
    if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

    const isPM = session.role === 'PROJECT_MANAGER' || isPMEmail(session.email);

    // Dynamic Permission Check: If not PM, verify user has scanner_logs permission
    if (!isPM) {
      const livePerms = await getLiveAdminPermissions(session.id);
      if (!livePerms.scanner_logs) {
        return NextResponse.json({ success: false, message: 'Access denied: Scanner logs permission required' }, { status: 403 });
      }
    }

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '100');
    const status = searchParams.get('status') || '';
    const volunteer = searchParams.get('volunteer') || '';
    const dateFrom = searchParams.get('date_from') || '';
    const dateTo = searchParams.get('date_to') || '';

    const supabase = createAdminClient();
    let query = supabase
      .from('scan_audit')
      .select('*')
      .order('scanned_at', { ascending: false });

    // STEALTH MODE: If caller is not PM, filter out any scans by PM and scans of PM stealth passes
    if (!isPM) {
      const pmEmails = ['muhammadarham979@gmail.com', 'arham.personal28@gmail.com'];
      for (const email of pmEmails) {
        query = query.not('scanned_by', 'ilike', `%${email}%`);
      }

      // Hide scans of PM-generated passes
      const { data: pmPasses } = await supabase
        .from('approved_passes')
        .select('id, roll_no')
        .eq('created_by_pm', true);

      if (pmPasses && pmPasses.length > 0) {
        const pmPassIds = pmPasses.map((p) => p.id).filter(Boolean);
        const pmRollNos = pmPasses.map((p) => p.roll_no).filter(Boolean);
        if (pmPassIds.length > 0) {
          query = query.not('approved_pass_id', 'in', `(${pmPassIds.map((id) => `"${id}"`).join(',')})`);
        }
        if (pmRollNos.length > 0) {
          query = query.not('roll_no', 'in', `(${pmRollNos.map((r) => `"${r}"`).join(',')})`);
        }
      }
    }

    query = query.limit(limit);

    if (status) query = query.eq('status', status);
    if (volunteer) query = query.ilike('scanned_by', `%${volunteer}%`);
    if (dateFrom) query = query.gte('scanned_at', dateFrom);
    if (dateTo) query = query.lte('scanned_at', dateTo);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true, logs: data });
  } catch (err) {
    console.error('Scanner logs error:', err);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}
