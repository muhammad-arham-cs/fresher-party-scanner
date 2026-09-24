import { NextResponse } from 'next/server';
import { checkAdminSession, getLiveAdminPermissions } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const session = await checkAdminSession();
  if (!session) {
    return NextResponse.json(
      { success: false, message: 'Not authenticated' },
      {
        status: 401,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
  }

  // Fetch real-time permissions from database so changes apply instantly
  const livePerms = await getLiveAdminPermissions(session.id);
  const adminWithPerms = { ...session, custom_permissions: livePerms };

  return NextResponse.json(
    { success: true, admin: adminWithPerms },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    }
  );
}

