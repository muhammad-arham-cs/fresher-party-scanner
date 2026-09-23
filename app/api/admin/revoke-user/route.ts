import { NextRequest, NextResponse } from 'next/server';
import { checkAdminSession } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const session = await checkAdminSession();
    if (!session || session.role !== 'PROJECT_MANAGER') {
      return NextResponse.json({ success: false, message: 'Access denied' }, { status: 403 });
    }

    const { user_id } = await req.json();
    if (!user_id) return NextResponse.json({ success: false, message: 'user_id required' }, { status: 400 });

    const supabase = createAdminClient();
    const { error } = await supabase
      .from('admin_users')
      .update({ is_active: false })
      .eq('id', user_id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Revoke user error:', err);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}
