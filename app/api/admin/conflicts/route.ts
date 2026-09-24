import { NextRequest, NextResponse } from 'next/server';
import { checkAdminSession, isPMEmail } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase';
import { logAuditEvent } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/conflicts
 * PM-only: Fetches pending pass conflicts.
 */
export async function GET() {
  const session = await checkAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const isPM = session.role === 'PROJECT_MANAGER' || isPMEmail(session.email);
  if (!isPM) {
    return NextResponse.json({ success: false, message: 'Access denied: Project Manager only' }, { status: 403 });
  }

  const supabase = createAdminClient();

  try {
    const { data: conflicts, error } = await supabase
      .from('pm_pass_conflicts')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      // If table doesn't exist yet, return empty list gracefully
      return NextResponse.json({ success: true, conflicts: [] });
    }

    if (!conflicts || conflicts.length === 0) {
      return NextResponse.json({ success: true, conflicts: [] });
    }

    // Enhance with pass info
    const passIds = Array.from(
      new Set(
        conflicts.flatMap((c) => [c.pm_pass_id, c.conflicting_pass_id]).filter(Boolean)
      )
    );

    const { data: passes } = await supabase
      .from('approved_passes')
      .select('id, roll_no, name, section, ticket_id, pass_status, created_at, entry_created_by, pass_pdf_url')
      .in('id', passIds);

    const passMap = new Map((passes || []).map((p) => [p.id, p]));

    const enriched = conflicts.map((c) => ({
      ...c,
      pm_pass: passMap.get(c.pm_pass_id) || null,
      conflicting_pass: passMap.get(c.conflicting_pass_id) || null,
    }));

    return NextResponse.json({ success: true, conflicts: enriched });
  } catch (err: any) {
    return NextResponse.json({ success: true, conflicts: [] });
  }
}

/**
 * POST /api/admin/conflicts
 * PM-only: Resolves a conflict with 'merge', 'keep_both', or 'dismiss'.
 */
export async function POST(req: NextRequest) {
  const session = await checkAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const isPM = session.role === 'PROJECT_MANAGER' || isPMEmail(session.email);
  if (!isPM) {
    return NextResponse.json({ success: false, message: 'Access denied: Project Manager only' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { conflict_id, resolution } = body;

    if (!conflict_id || !['merge', 'keep_both', 'dismiss'].includes(resolution)) {
      return NextResponse.json({ success: false, message: 'Invalid conflict_id or resolution' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const now = new Date().toISOString();

    const { error } = await supabase
      .from('pm_pass_conflicts')
      .update({
        status: resolution === 'merge' ? 'merged' : resolution === 'keep_both' ? 'kept_both' : 'dismissed',
        resolved_at: now,
      })
      .eq('id', conflict_id);

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    // Log resolution to audit_logs
    await logAuditEvent({
      action_type: 'manual_entry_created' as any,
      performed_by: session.email,
      user_role: session.role,
      details: {
        action: 'conflict_resolved',
        conflict_id,
        resolution,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Conflict marked as ${resolution.replace('_', ' ')} successfully.`,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message || 'Server error' }, { status: 500 });
  }
}
