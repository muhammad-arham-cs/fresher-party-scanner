import { createAdminClient } from '@/lib/supabase';
import { isPMEmail } from '@/lib/admin-auth';

export type AuditActionType =
  | 'double_scan_forced'
  | 'pass_downloaded'
  | 'manual_entry_created'
  | 'admin_login'
  | 'email_sent'
  | 'admin_user_invited'
  | 'admin_user_revoked'
  | 'admin_user_deleted'
  | 'admin_user_reactivated'
  | 'pass_revoked'
  | 'pass_restored';

export interface LogAuditParams {
  action_type: AuditActionType;
  performed_by: string; // email or volunteer name
  user_role?: string;
  roll_no?: string | null;
  student_name?: string | null;
  details?: Record<string, unknown> | null;
}

/**
 * Log a critical system event to the audit_logs table.
 */
export async function logAuditEvent(params: LogAuditParams): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.from('audit_logs').insert({
      action_type: params.action_type,
      performed_by: params.performed_by,
      roll_no: params.roll_no || null,
      student_name: params.student_name || null,
      details: params.details || null,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    // Never let audit logging failure crash primary operation, but log on server
    console.error('Audit logging error:', err);
  }
}
