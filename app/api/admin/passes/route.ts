import { NextRequest, NextResponse } from 'next/server';
import { checkAdminSession } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase';

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
    if (search) query = query.or(`roll_no.ilike.%${search}%,name.ilike.%${search}%,ticket_id.ilike.%${search}%`);

    const { data, count, error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true, passes: data, total: count });
  } catch (err) {
    console.error('Get passes error:', err);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}
