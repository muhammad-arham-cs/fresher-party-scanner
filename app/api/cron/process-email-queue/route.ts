import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { checkEmailQuota, incrementEmailQuota } from '@/lib/email-quota';
import { sendEmailWithFailover } from '@/lib/email-service';
import { checkAdminSession } from '@/lib/admin-auth';
import { buildPassAttachment, buildPassEmailHtml } from '@/lib/pass-email-helpers';

export async function GET(request: NextRequest) {
  return handleQueueProcessing(request);
}

export async function POST(request: NextRequest) {
  return handleQueueProcessing(request);
}

async function handleQueueProcessing(request: NextRequest) {
  // Verify authorization (CRON_SECRET or Admin session)
  const authHeader = request.headers.get('authorization');
  const cronSecretHeader = request.headers.get('x-cron-secret');
  const cronSecret = process.env.CRON_SECRET;

  let isAuthorized = false;

  if (cronSecret && (authHeader === `Bearer ${cronSecret}` || cronSecretHeader === cronSecret)) {
    isAuthorized = true;
  } else {
    const adminSession = await checkAdminSession();
    if (adminSession) {
      isAuthorized = true;
    }
  }

  // In production, if CRON_SECRET is set, reject unauthorized calls
  if (!isAuthorized && process.env.NODE_ENV === 'production' && cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 1. Check current email quota
    const quota = await checkEmailQuota();

    if (!quota.canSend) {
      return NextResponse.json({
        status: 'quota_limit_reached',
        message: quota.reason,
        queued: 0,
        sent: 0,
        quota,
      });
    }

    // 2. Fetch queued emails up to allowable quota
    const limit = quota.canSendMore || 1;
    const { data: queuedEmails, error: fetchError } = await supabase
      .from('email_queue')
      .select('*')
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(limit);

    if (fetchError) {
      throw fetchError;
    }

    if (!queuedEmails || queuedEmails.length === 0) {
      return NextResponse.json({
        status: 'no_emails_queued',
        sent: 0,
        remaining: 0,
        quota,
      });
    }

    let sentCount = 0;
    let failedCount = 0;

    for (const email of queuedEmails) {
      try {
        const studentEmail = email.email;
        const studentRollNo = email.roll_no;
        const passId = email.approved_pass_id;

        // Lookup pass details if approved_pass_id or roll_no is present
        let pass = null;
        if (passId) {
          const { data } = await supabase
            .from('approved_passes')
            .select('*')
            .eq('id', passId)
            .maybeSingle();
          pass = data;
        } else if (studentRollNo) {
          const { data } = await supabase
            .from('approved_passes')
            .select('*')
            .eq('roll_no', studentRollNo)
            .maybeSingle();
          pass = data;
        }

        const studentName = email.student_name || pass?.name || 'Student';
        const rollNo = studentRollNo || pass?.roll_no || 'N/A';
        const department = email.department || pass?.department || '';
        const qrToken = email.qr_token || pass?.qr_token || '';
        const batch = email.batch || pass?.batch || '2026';
        const society = email.society || pass?.society || '';

        // Build PDF attachment (fetches from Storage once → attaches to email)
        const attachments = await buildPassAttachment(rollNo, qrToken, {
          name: studentName,
          roll_no: rollNo,
          department,
          batch,
          society,
          qr_token: qrToken,
        });

        // Build email HTML (says "Your pass is attached" — no signed URL link)
        const htmlContent = buildPassEmailHtml(studentName, rollNo);

        // Send with failover: Primary Brevo → Backup Brevo → Grok
        const result = await sendEmailWithFailover(
          studentEmail,
          '🎉 Your Fresher Party 2026 Pass is Ready!',
          htmlContent,
          attachments
        );

        const now = new Date().toISOString();

        if (result.status === 'sent') {
          // Update email_queue
          await supabase
            .from('email_queue')
            .update({
              status: 'sent',
              sent_at: now,
              attempts: (email.attempts || 0) + 1,
              error_message: null,
            })
            .eq('id', email.id);

          // Update approved_passes
          if (pass?.id) {
            await supabase
              .from('approved_passes')
              .update({ pass_status: 'email_sent', pass_sent_at: now })
              .eq('id', pass.id);
          } else if (rollNo) {
            await supabase
              .from('approved_passes')
              .update({ pass_status: 'email_sent', pass_sent_at: now })
              .eq('roll_no', rollNo);
          }

          await incrementEmailQuota(result.apiUsed || undefined, 1);
          sentCount++;
        } else {
          // Queue for retry
          const currentAttempts = (email.attempts || 0) + 1;
          await supabase
            .from('email_queue')
            .update({
              status: currentAttempts >= 5 ? 'failed' : 'queued',
              attempts: currentAttempts,
              error_message: result.message,
            })
            .eq('id', email.id);

          failedCount++;
        }
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : 'Processing error';
        console.error('Error processing queued email item:', errorMsg);
        failedCount++;

        await supabase
          .from('email_queue')
          .update({
            status: 'failed',
            error_message: errorMsg,
          })
          .eq('id', email.id);
      }
    }

    return NextResponse.json({
      status: 'success',
      sent: sentCount,
      failed: failedCount,
      remaining_in_queue: Math.max(0, queuedEmails.length - sentCount),
      quota: {
        hourly_used: (quota.emailsSentThisHour || 0) + sentCount,
        daily_used: (quota.emailsSentToday || 0) + sentCount,
        hourly_limit: 70,
        daily_limit: 550,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Cron job error';
    console.error('Cron job error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
