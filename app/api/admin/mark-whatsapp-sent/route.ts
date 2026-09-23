import { NextRequest, NextResponse } from 'next/server';
import { checkAdminSession } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const session = await checkAdminSession();
    if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

    const { pass_id } = await req.json();
    if (!pass_id) return NextResponse.json({ success: false, message: 'pass_id required' }, { status: 400 });

    const supabase = createAdminClient();
    const { error } = await supabase
      .from('approved_passes')
      .update({ pass_status: 'sent_via_whatsapp', pass_sent_at: new Date().toISOString() })
      .eq('id', pass_id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Mark whatsapp sent error:', err);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}
