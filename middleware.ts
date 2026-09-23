import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const PUBLIC_PATHS = [
  '/admin/login',
  '/admin/onboarding',
  '/scanner/login',
  '/api/auth/login',
  '/api/auth/setup-password',
  '/api/scanner/login',
  '/api/cron',
];

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured');
  return new TextEncoder().encode(secret);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Protect /api/admin/* API routes
  if (pathname.startsWith('/api/admin')) {
    const token =
      request.cookies.get('auth_token')?.value ||
      request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

    if (!token) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized. Authentication token required.' },
        { status: 401 }
      );
    }

    try {
      const { payload } = await jwtVerify(token, getJwtSecret());
      const role = payload.role as string;
      if (role === 'SCANNER') {
        return NextResponse.json(
          { success: false, message: 'Forbidden. Admin privileges required.' },
          { status: 403 }
        );
      }
      return NextResponse.next();
    } catch {
      return NextResponse.json(
        { success: false, message: 'Session expired or invalid. Please login again.' },
        { status: 401 }
      );
    }
  }

  // Protect /admin/* UI routes
  if (pathname.startsWith('/admin')) {
    const token = request.cookies.get('auth_token')?.value;
    if (!token) {
      return NextResponse.redirect(new URL(`/admin/login?redirect=${encodeURIComponent(pathname)}`, request.url));
    }
    try {
      const { payload } = await jwtVerify(token, getJwtSecret());
      const role = payload.role as string;
      // SCANNER role cannot access admin dashboard
      if (role === 'SCANNER' && pathname.startsWith('/admin/dashboard')) {
        return NextResponse.redirect(new URL('/scanner', request.url));
      }
    } catch {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
  }

  // Protect /scanner UI routes (requires volunteer or admin session)
  if (pathname === '/scanner' || (pathname.startsWith('/scanner/') && pathname !== '/scanner/login')) {
    const token = request.cookies.get('scanner_token')?.value || request.cookies.get('auth_token')?.value;
    if (!token) {
      return NextResponse.redirect(new URL('/scanner/login', request.url));
    }
    try {
      await jwtVerify(token, getJwtSecret());
    } catch {
      return NextResponse.redirect(new URL('/scanner/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*', '/scanner/:path*'],
};
