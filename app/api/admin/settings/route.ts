import { NextRequest, NextResponse } from 'next/server';
import { checkAdminSession, isPMEmail } from '@/lib/admin-auth';
import { getSystemSettings, updateSystemSettings } from '@/lib/system-settings';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await checkAdminSession();
    if (!session) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const isPM = session.role === 'PROJECT_MANAGER' || isPMEmail(session.email);
    const settings = await getSystemSettings();

    return NextResponse.json({
      success: true,
      settings,
      is_pm: isPM,
    });
  } catch (err: any) {
    console.error('Settings GET error:', err);
    return NextResponse.json({ success: false, message: 'Failed to load settings' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await checkAdminSession();
    if (!session) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const isPM = session.role === 'PROJECT_MANAGER' || isPMEmail(session.email);
    if (!isPM) {
      return NextResponse.json(
        { success: false, message: 'Access denied: Project Manager only' },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { require_email_for_manual_pass, hourly_email_override } = body;

    const updates: Record<string, boolean> = {};
    if (typeof require_email_for_manual_pass === 'boolean') {
      updates.require_email_for_manual_pass = require_email_for_manual_pass;
    }
    if (typeof hourly_email_override === 'boolean') {
      updates.hourly_email_override = hourly_email_override;
    }

    const result = await updateSystemSettings(updates, session.email);
    if (!result.success) {
      return NextResponse.json({ success: false, message: result.error || 'Failed to update settings' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Settings updated successfully',
      settings: result.settings,
    });
  } catch (err: any) {
    console.error('Settings POST error:', err);
    return NextResponse.json({ success: false, message: 'Failed to update settings' }, { status: 500 });
  }
}
