import { NextRequest, NextResponse } from 'next/server';
import { verifyScannerPassword, generateScannerJWT, setScannerCookie } from '@/lib/admin-auth';

export async function POST(req: NextRequest) {
  try {
    const { name, password } = await req.json();

    if (!name || !name.trim()) {
      return NextResponse.json({ success: false, message: 'Volunteer name is required' }, { status: 400 });
    }

    if (!password) {
      return NextResponse.json({ success: false, message: 'Scanner password is required' }, { status: 400 });
    }

    const isValidPassword = verifyScannerPassword(password);
    if (!isValidPassword) {
      return NextResponse.json({ success: false, message: 'Incorrect scanner password' }, { status: 401 });
    }

    const cleanName = name.trim();
    const token = await generateScannerJWT(cleanName);
    await setScannerCookie(token);

    return NextResponse.json({
      success: true,
      message: 'Scanner access granted',
      volunteer_name: cleanName,
    });
  } catch (err) {
    console.error('Scanner login error:', err);
    return NextResponse.json({ success: false, message: 'Server error during login' }, { status: 500 });
  }
}
