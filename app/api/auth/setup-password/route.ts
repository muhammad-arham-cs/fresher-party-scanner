import { NextRequest, NextResponse } from 'next/server';
import { hashPassword } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Helper to parse timestamps from Supabase/Postgres safely in UTC.
 */
function parseExpiryDate(rawDateString: string | null | undefined): Date | null {
  if (!rawDateString) return null;
  const raw = String(rawDateString).trim();
  // If Postgres returned a TIMESTAMP without timezone, ensure it's interpreted as UTC
  const iso = raw.endsWith('Z') || raw.includes('+') ? raw : raw + 'Z';
  const parsed = new Date(iso);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Validate an onboarding token when the user opens the setup page.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');
    const email = searchParams.get('email');

    if (!token && !email) {
      return NextResponse.json({ success: false, message: 'Onboarding link is missing a setup token.' }, { status: 400 });
    }

    const supabase = createAdminClient();
    let query = supabase.from('admin_users').select('id, name, email, role, is_active, password_setup_token, password_setup_expires');
    if (token) {
      query = query.eq('password_setup_token', token);
    } else if (email) {
      query = query.eq('email', email.toLowerCase());
    }

    const { data: admin } = await query.maybeSingle();

    if (!admin) {
      return NextResponse.json({
        success: false,
        message: 'This setup link is invalid or has already been used. Please request a new invite.',
      }, { status: 404 });
    }

    if (!admin.is_active) {
      return NextResponse.json({ success: false, message: 'This account has been deactivated.' }, { status: 403 });
    }

    // Check expiration using UTC normalized timestamp
    const expiresAt = parseExpiryDate(admin.password_setup_expires);
    if (expiresAt && new Date() > expiresAt) {
      return NextResponse.json({
        success: false,
        expired: true,
        message: 'This onboarding link has expired. Please contact the Project Manager to resend your invite.',
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      name: admin.name,
      email: admin.email,
      role: admin.role,
    });
  } catch (err) {
    console.error('Validate setup token error:', err);
    return NextResponse.json({ success: false, message: 'Server error validating link' }, { status: 500 });
  }
}

/**
 * Set new password for the admin user.
 */
export async function POST(req: NextRequest) {
  try {
    const { token, email, password } = await req.json();

    if (!password) {
      return NextResponse.json({ success: false, message: 'Password is required' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ success: false, message: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const supabase = createAdminClient();

    let query = supabase.from('admin_users').select('*');
    if (token) {
      query = query.eq('password_setup_token', token);
    } else if (email) {
      query = query.eq('email', email.toLowerCase());
    } else {
      return NextResponse.json({ success: false, message: 'Onboarding token or email is required' }, { status: 400 });
    }

    const { data: admin } = await query.maybeSingle();

    if (!admin) {
      return NextResponse.json({ success: false, message: 'Invalid onboarding link or account not found' }, { status: 404 });
    }

    if (!admin.is_active) {
      return NextResponse.json({ success: false, message: 'This account has been deactivated' }, { status: 403 });
    }

    // Normalize Postgres timestamp to UTC before comparing
    const expiresAt = parseExpiryDate(admin.password_setup_expires);
    if (expiresAt && new Date() > expiresAt) {
      return NextResponse.json({
        success: false,
        message: 'Link expired. Request new onboarding link from Project Manager.',
      }, { status: 400 });
    }

    const hashedPassword = await hashPassword(password);

    // Update password and clear setup token
    await supabase
      .from('admin_users')
      .update({
        password_hash: hashedPassword,
        password_setup_token: null,
        password_setup_expires: null,
      })
      .eq('id', admin.id);

    return NextResponse.json({ success: true, message: 'Password set successfully' });
  } catch (err) {
    console.error('Setup password error:', err);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}
