import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { createAdminClient } from '@/lib/supabase';

const SALT_ROUNDS = 10;
const ADMIN_JWT_EXPIRATION = '1h'; // 1 hour session for all admin roles
const SCANNER_JWT_EXPIRATION = '8h'; // 8 hours session for scanner volunteers

export interface AdminSession {
  id: string;
  email: string;
  name: string;
  role: string; // 'PROJECT_MANAGER' | 'ENTRY_MANAGER' | 'ENTRY_SUPERVISOR' | 'SCANNER'
  is_active: boolean;
}

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured');
  return new TextEncoder().encode(secret);
}

/**
 * Hash a plaintext password using bcrypt.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compare a plaintext password against a bcrypt hash.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Check if the provided scanner password matches the environment variable.
 */
export function verifyScannerPassword(password: string): boolean {
  const expected = process.env.SCANNER_PASSWORD || 'fresher2026';
  return password === expected;
}

/**
 * Generate a JWT token for an admin session (expires in 1 hour).
 */
export async function generateJWT(payload: AdminSession): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ADMIN_JWT_EXPIRATION)
    .sign(getJwtSecret());
}

/**
 * Generate an 8-hour JWT token for a scanner volunteer.
 */
export async function generateScannerJWT(volunteerName: string): Promise<string> {
  const payload: AdminSession = {
    id: 'volunteer-' + Date.now(),
    email: `${volunteerName.toLowerCase().replace(/\s+/g, '.')}@volunteer.local`,
    name: volunteerName,
    role: 'SCANNER',
    is_active: true,
  };
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(SCANNER_JWT_EXPIRATION)
    .sign(getJwtSecret());
}

/**
 * Verify and decode a JWT token.
 */
export async function verifyJWT(token: string): Promise<AdminSession | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return payload as unknown as AdminSession;
  } catch {
    return null;
  }
}

/**
 * Check the current admin session from the httpOnly cookie.
 */
export async function checkAdminSession(): Promise<AdminSession | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;
    if (!token) return null;
    return verifyJWT(token);
  } catch {
    return null;
  }
}

/**
 * Check the scanner session from the cookie (either scanner_token or auth_token).
 */
export async function checkScannerSession(): Promise<AdminSession | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('scanner_token')?.value || cookieStore.get('auth_token')?.value;
    if (!token) return null;
    const session = await verifyJWT(token);
    if (!session) return null;
    return session;
  } catch {
    return null;
  }
}

/**
 * Check if an email is a hardcoded PM email.
 */
export function isPMEmail(email: string): boolean {
  const pmEmails = (process.env.PM_EMAILS || '').split(',').map((e) => e.trim().toLowerCase());
  return pmEmails.includes(email.toLowerCase());
}

/**
 * Authenticate an admin by email + password.
 * Returns the admin record if valid, null otherwise.
 */
export async function authenticateAdmin(email: string, password: string): Promise<AdminSession | null> {
  const supabase = createAdminClient();

  const { data: admin } = await supabase
    .from('admin_users')
    .select('*')
    .eq('email', email.toLowerCase())
    .eq('is_active', true)
    .maybeSingle();

  if (!admin) return null;
  if (!admin.password_hash) return null;

  const valid = await verifyPassword(password, admin.password_hash);
  if (!valid) return null;

  // Update last login
  await supabase
    .from('admin_users')
    .update({ last_login: new Date().toISOString() })
    .eq('id', admin.id);

  return {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
    is_active: admin.is_active,
  };
}

/**
 * Set the admin auth cookie (1 hour expiration).
 */
export async function setAuthCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60, // 1 hour
    path: '/',
  });
}

/**
 * Set the scanner volunteer auth cookie (8 hours expiration).
 */
export async function setScannerCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set('scanner_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 8, // 8 hours
    path: '/',
  });
}

/**
 * Clear the auth cookies.
 */
export async function clearAuthCookie() {
  const cookieStore = await cookies();
  cookieStore.delete('auth_token');
  cookieStore.delete('scanner_token');
}

/**
 * Check if an admin role has a specific permission.
 */
export function hasPermission(role: string, permission: string): boolean {
  const permissions: Record<string, string[]> = {
    PROJECT_MANAGER: ['all'],
    ENTRY_MANAGER: ['excel_upload', 'manual_entry', 'pass_management', 'approve_entries', 'email_queue', 'audit_logs', 'gate_checkin'],
    ENTRY_SUPERVISOR: ['excel_upload', 'manual_entry', 'pass_management', 'approve_entries', 'scanner_logs', 'email_queue', 'audit_logs', 'gate_checkin'],
    SCANNER: ['scan', 'gate_checkin'],
  };

  const rolePerms = permissions[role] || [];
  if (rolePerms.includes('all')) return true;
  return rolePerms.includes(permission);
}
