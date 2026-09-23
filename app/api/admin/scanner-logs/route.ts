import { NextRequest, NextResponse } from 'next/server';
import { checkAdminSession } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const session = await checkAdminSession();
    if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

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
      .order('scanned_at', { ascending: false })
      .limit(limit);

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
