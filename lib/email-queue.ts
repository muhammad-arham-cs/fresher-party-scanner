import { createAdminClient } from '@/lib/supabase';
import { sendEmailWithFailover } from '@/lib/email-service';
import { logAuditEvent } from '@/lib/audit';
import { buildPassAttachment, buildPassEmailHtml } from '@/lib/pass-email-helpers';
import { getSystemSettings } from '@/lib/system-settings';
import { v4 as uuidv4 } from 'uuid';

export const HOURLY_LIMIT = 70;
export const DAILY_LIMIT = 550;

export interface EnqueueEmailParams {
  student_name: string;
  email: string;
  roll_no: string;
  department?: string;
  batch?: string;
  society?: string;
  qr_token?: string;
  pass_pdf_url?: string;
}

export interface QuotaStatus {
  date: string;
  hour: number;
  minutes_to_reset: number;
  hourly_used: number;
  hourly_limit: number;
  hourly_remaining: number;
  daily_used: number;
  daily_limit: number;
  daily_remaining: number;
  can_send: number;
  queued_count: number;
  is_cooldown: boolean;
  cooldown_reason?: string;
  hourly_override_active: boolean;
}

function getUtcDateAndHour() {
  const now = new Date();
  const date = now.toISOString().split('T')[0]; // 'YYYY-MM-DD'
  const hour = now.getUTCHours(); // 0-23
  const minutes_to_reset = 60 - now.getUTCMinutes();
  return { date, hour, minutes_to_reset };
}

/**
 * Add an email to the persistent email queue.
 */
export async function enqueueEmail(params: EnqueueEmailParams): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('email_queue')
      .insert({
        student_name: params.student_name || 'Student',
        email: params.email,
        roll_no: params.roll_no || 'N/A',
        department: params.department || 'General',
        batch: params.batch || '2026',
        society: params.society || '',
        qr_token: params.qr_token || uuidv4(),
        pass_pdf_url: params.pass_pdf_url || null,
        status: 'queued',
        attempts: 0,
        created_at: new Date().toISOString(),
        scheduled_for: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) throw error;
    return { success: true, id: data.id };
  } catch (err) {
    console.error('Failed to enqueue email:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Enqueue error' };
  }
}

/**
 * Record a directly sent email into email_queue so it appears in recent dispatches.
 */
export async function recordDirectEmailSent(params: {
  student_name: string;
  email: string;
  roll_no: string;
  department?: string;
  batch?: string;
  society?: string;
  qr_token?: string;
  pass_pdf_url?: string;
}): Promise<void> {
  try {
    const supabase = createAdminClient();
    const now = new Date().toISOString();

    // Check if an entry for this roll_no already exists in email_queue
    const { data: existing } = await supabase
      .from('email_queue')
      .select('id')
      .eq('roll_no', params.roll_no)
      .limit(1)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('email_queue')
        .update({
          status: 'sent',
          sent_at: now,
          attempts: 1,
          pass_pdf_url: params.pass_pdf_url || undefined,
          error_message: null,
        })
        .eq('id', existing.id);
    } else {
      await supabase.from('email_queue').insert({
        student_name: params.student_name || 'Student',
        email: params.email,
        roll_no: params.roll_no,
        department: params.department || 'General',
        batch: params.batch || '2026',
        society: params.society || '',
        qr_token: params.qr_token || uuidv4(),
        pass_pdf_url: params.pass_pdf_url || null,
        status: 'sent',
        attempts: 1,
        created_at: now,
        sent_at: now,
        scheduled_for: now,
      });
    }
  } catch (err) {
    console.error('Failed to record directly sent email in email_queue:', err);
  }
}

/**
 * Enqueue a batch of emails.
 */
export async function enqueueEmailBatch(items: EnqueueEmailParams[]): Promise<number> {
  if (items.length === 0) return 0;
  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const rows = items.map((item) => ({
    student_name: item.student_name || 'Student',
    email: item.email,
    roll_no: item.roll_no || 'N/A',
    department: item.department || 'General',
    batch: item.batch || '2026',
    society: item.society || '',
    qr_token: item.qr_token || uuidv4(),
    pass_pdf_url: item.pass_pdf_url || null,
    status: 'queued',
    attempts: 0,
    created_at: now,
    scheduled_for: now,
  }));

  const { data, error } = await supabase.from('email_queue').insert(rows).select('id');
  if (error) {
    console.error('Batch enqueue error:', error);
    return 0;
  }
  return data?.length || 0;
}

/**
 * Get current hourly and daily quota status (70/hr, 550/day).
 */
/**
 * Get current hourly and daily quota status (70/hr, 550/day).
 * Supports PM hourly override to expand hourly capacity up to daily limit (550).
 */
export async function getQuotaStatus(): Promise<QuotaStatus> {
  const supabase = createAdminClient();
  const { date, hour } = getUtcDateAndHour();
  const settings = await getSystemSettings();
  const isOverride = Boolean(settings.hourly_email_override);

  // 1. Get sum of emails sent today from email_quota
  const { data: todayRows } = await supabase
    .from('email_quota')
    .select('count')
    .eq('date', date);

  const daily_used = todayRows ? todayRows.reduce((sum, r) => sum + (r.count || 0), 0) : 0;

  // 2. Get count for current hour
  const { data: currentHourRow } = await supabase
    .from('email_quota')
    .select('count')
    .eq('date', date)
    .eq('hour', hour)
    .maybeSingle();

  const hourly_used = currentHourRow?.count || 0;

  // 3. Count pending queued emails
  const { count: queuedCount } = await supabase
    .from('email_queue')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'queued');

  const effectiveHourlyLimit = isOverride ? DAILY_LIMIT : HOURLY_LIMIT;
  const hourly_remaining = isOverride
    ? Math.max(0, DAILY_LIMIT - daily_used)
    : Math.max(0, HOURLY_LIMIT - hourly_used);

  const daily_remaining = Math.max(0, DAILY_LIMIT - daily_used);
  const can_send = Math.min(hourly_remaining, daily_remaining);

  const is_cooldown = can_send === 0 && (queuedCount || 0) > 0;
  let cooldown_reason: string | undefined;
  if (is_cooldown) {
    cooldown_reason = daily_remaining === 0
      ? `Daily limit reached (${DAILY_LIMIT}/${DAILY_LIMIT}). Resumes tomorrow at 00:00 UTC.`
      : isOverride
        ? `Daily limit reached (${daily_used}/${DAILY_LIMIT}). Resumes tomorrow at 00:00 UTC.`
        : `Hourly limit reached (${hourly_used}/${HOURLY_LIMIT}). Resumes next hour (or enable PM Hourly Override).`;
  }

  return {
    date,
    hour,
    minutes_to_reset: getUtcDateAndHour().minutes_to_reset,
    hourly_used,
    hourly_limit: effectiveHourlyLimit,
    hourly_remaining,
    daily_used,
    daily_limit: DAILY_LIMIT,
    daily_remaining,
    can_send,
    queued_count: queuedCount || 0,
    is_cooldown,
    cooldown_reason,
    hourly_override_active: isOverride,
  };
}

/**
 * Reset current hour email quota count to 0 (PM utility).
 */
export async function resetHourlyQuota(): Promise<boolean> {
  try {
    const supabase = createAdminClient();
    const { date, hour } = getUtcDateAndHour();
    const { error } = await supabase
      .from('email_quota')
      .delete()
      .eq('date', date)
      .eq('hour', hour);
    return !error;
  } catch (err) {
    console.error('Failed to reset hourly quota:', err);
    return false;
  }
}

/**
 * Record emails successfully sent into the quota tracking table.
 */
export async function recordEmailsSent(count: number, _apiUsed: string = 'primary'): Promise<void> {
  if (count <= 0) return;
  const supabase = createAdminClient();
  const { date, hour } = getUtcDateAndHour();

  const { data: existing } = await supabase
    .from('email_quota')
    .select('id, count')
    .eq('date', date)
    .eq('hour', hour)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('email_quota')
      .update({
        count: (existing.count || 0) + count,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
  } else {
    await supabase.from('email_quota').insert({
      date,
      hour,
      count,
      updated_at: new Date().toISOString(),
    });
  }
}

/**
 * Process queued emails up to allowable quota using Dual Brevo + Grok failover.
 * Dispatches safely in batches of up to maxBatchSize (default 70).
 */
export async function processEmailQueue(maxBatchSize: number = 70): Promise<{
  processed: number;
  failed: number;
  status: QuotaStatus;
}> {
  const quota = await getQuotaStatus();
  if (quota.can_send <= 0) {
    return { processed: 0, failed: 0, status: quota };
  }

  const supabase = createAdminClient();
  const limitCount = Math.min(quota.can_send, maxBatchSize);

  const { data: items, error } = await supabase
    .from('email_queue')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(limitCount);

  if (error || !items || items.length === 0) {
    return { processed: 0, failed: 0, status: quota };
  }

  let processed = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const studentEmail = item.email;
      const rollNo = item.roll_no;
      const studentName = item.student_name;

      // Check if pass is deleted or revoked before dispatching email
      const { data: pass } = await supabase
        .from('approved_passes')
        .select('id, pass_status')
        .eq('roll_no', rollNo)
        .maybeSingle();

      if (!pass) {
        // Pass was permanently deleted, purge from queue
        await supabase.from('email_queue').delete().eq('id', item.id);
        continue;
      }

      if (pass.pass_status === 'revoked') {
        // Pass was revoked, abort dispatch
        await supabase
          .from('email_queue')
          .update({
            status: 'failed',
            error_message: 'Pass revoked: delivery aborted',
          })
          .eq('id', item.id);
        failed++;
        continue;
      }

      // Build PDF attachment (fetches from Storage once → attaches to email)
      const attachments = await buildPassAttachment(rollNo, item.qr_token || '', {
        name: studentName || 'Student',
        roll_no: rollNo,
        department: item.department || 'General',
        batch: item.batch || '2026',
        society: item.society || '',
        qr_token: item.qr_token || '',
      });

      // Build email HTML (says "Your pass is attached" — no signed URL link)
      const htmlContent = buildPassEmailHtml(studentName || 'Student', rollNo, {
        department: item.department,
        batch: item.batch,
      });

      // Send with multi-API failover: Primary Brevo → Backup Brevo → Grok
      const result = await sendEmailWithFailover(
        studentEmail,
        '🎉 Your Fresher Party 2026 Pass is Ready!',
        htmlContent,
        attachments
      );

      const now = new Date().toISOString();

      if (result.status === 'sent') {
        processed++;
        await supabase
          .from('email_queue')
          .update({
            status: 'sent',
            sent_at: now,
            attempts: (item.attempts || 0) + 1,
            error_message: null,
          })
          .eq('id', item.id);

        await supabase
          .from('approved_passes')
          .update({
            pass_status: 'email_sent',
            pass_sent_at: now,
          })
          .eq('roll_no', rollNo);

        await logAuditEvent({
          action_type: 'email_sent',
          performed_by: `email-queue-${result.apiUsed || 'api'}`,
          roll_no: rollNo,
          student_name: studentName,
          details: { email: studentEmail, api_used: result.apiUsed },
        });

        await recordEmailsSent(1, result.apiUsed || 'primary');
      } else {
        failed++;
        const attempts = (item.attempts || 0) + 1;
        await supabase
          .from('email_queue')
          .update({
            status: attempts >= 5 ? 'failed' : 'queued',
            attempts,
            error_message: result.message,
          })
          .eq('id', item.id);
      }
    } catch (err) {
      failed++;
      const errMsg = err instanceof Error ? err.message : 'Send error';
      await supabase
        .from('email_queue')
        .update({
          status: 'failed',
          error_message: errMsg,
        })
        .eq('id', item.id);
    }
  }

  const updatedQuota = await getQuotaStatus();
  return { processed, failed, status: updatedQuota };
}
