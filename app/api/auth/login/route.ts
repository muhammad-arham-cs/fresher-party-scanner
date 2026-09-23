import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin, generateJWT } from '@/lib/admin-auth';
import { logAuditEvent } from '@/lib/audit';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ success: false, message: 'Email and password are required' }, { status: 400 });
    }

    const admin = await authenticateAdmin(email.trim().toLowerCase(), password);

    if (!admin) {
      return NextResponse.json({ success: false, message: 'Invalid email or password' }, { status: 401 });
    }

    const token = await generateJWT(admin);

    // Security Update #8: Log admin login in audit_logs (skips PM actions automatically)
    await logAuditEvent({
      action_type: 'admin_login',
      performed_by: admin.email,
      user_role: admin.role,
      details: {
        admin_name: admin.name,
        role: admin.role,
        user_agent: req.headers.get('user-agent') || undefined,
      },
    });

    const response = NextResponse.json({
      success: true,
      user: { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
    });

    // Security Update #10: Cookie maxAge set to 1 hour (3600 seconds)
    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60, // 1 hour
      path: '/',
    });

    return response;
  } catch (err) {
    console.error('Login error:', err);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}
