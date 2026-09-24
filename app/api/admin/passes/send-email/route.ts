import { NextRequest, NextResponse } from 'next/server';
import { checkAdminSession, isPMEmail } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase';
import { checkEmailQuota, incrementEmailQuota } from '@/lib/email-quota';
import { recordDirectEmailSent } from '@/lib/email-queue';
import { sendEmailWithFailover } from '@/lib/email-service';
import { logAuditEvent } from '@/lib/audit';
import { buildPassAttachment, buildPassEmailHtml } from '@/lib/pass-email-helpers';

export async function POST(req: NextRequest) {
  try {
    const session = await checkAdminSession();
    if (!session) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { pass_id, roll_no } = body;

    if (!pass_id && !roll_no) {
      return NextResponse.json({ success: false, message: 'Pass ID or Roll Number is required' }, { status: 400 });
    }

    const isPM = session.role === 'PROJECT_MANAGER' || isPMEmail(session.email);
    const supabase = createAdminClient();

    // Query the pass
    let query = supabase.from('approved_passes').select('*');
    if (!isPM) {
      query = query.or('created_by_pm.is.null,created_by_pm.eq.false');
    }
    if (pass_id) {
      query = query.eq('id', pass_id);
    } else if (roll_no) {
      query = query.eq('roll_no', roll_no.trim());
    }

    const { data: pass, error: fetchError } = await query.maybeSingle();

    if (fetchError || !pass) {
      return NextResponse.json({ success: false, message: 'Pass not found' }, { status: 404 });
    }

    if (pass.pass_status === 'revoked') {
      return NextResponse.json({
        success: false,
        message: `Pass for "${pass.name}" has been revoked by administrators and cannot be emailed. Please restore the pass first.`,
      }, { status: 400 });
    }

    if (!pass.email || !pass.email.trim() || !pass.email.includes('@')) {
      return NextResponse.json({
        success: false,
        message: `Student "${pass.name}" does not have a valid email address configured.`,
      }, { status: 400 });
    }

    // Check email quota before sending
    const quota = await checkEmailQuota();
    if (!quota.canSend) {
      return NextResponse.json({
        success: false,
        message: quota.reason || 'Daily or hourly email sending quota reached.',
      }, { status: 429 });
    }

    const studentName = pass.name;
    const studentRollNo = pass.roll_no;
    const studentEmail = pass.email.trim();

    // Build PDF attachment (downloads from Storage once → attaches directly to email)
    const attachments = await buildPassAttachment(studentRollNo, pass.qr_token, {
      name: studentName,
      roll_no: studentRollNo,
      department: pass.department,
      batch: pass.batch,
      section: pass.section,
      society: pass.society,
      qr_token: pass.qr_token,
    });

    // Build email HTML (no signed URL link needed — PDF is attached)
    const htmlContent = buildPassEmailHtml(studentName, studentRollNo, {
      ticketId: pass.section,
      department: pass.department,
      batch: pass.batch,
    });

    // Send email with PDF attachment via failover: Primary Brevo → Backup Brevo → Grok
    const sendResult = await sendEmailWithFailover(
      studentEmail,
      '🎉 Your Fresher Party 2026 Pass is Ready!',
      htmlContent,
      attachments
    );

    if (sendResult.status === 'failed') {
      return NextResponse.json({
        success: false,
        message: 'Failed to send email through all available email providers. Please try again later.',
      }, { status: 502 });
    }

    const now = new Date().toISOString();

    // 1. Update approved_passes status
    await supabase
      .from('approved_passes')
      .update({
        pass_status: 'email_sent',
        pass_sent_at: now,
      })
      .eq('id', pass.id);

    // 2. Increment daily and hourly quota counter by 1
    await incrementEmailQuota(sendResult.apiUsed || undefined, 1);

    // 3. Record in email_queue so it appears in recent email dispatches
    await recordDirectEmailSent({
      student_name: studentName,
      email: studentEmail,
      roll_no: studentRollNo,
      department: pass.department,
      batch: pass.batch,
      society: pass.society,
      qr_token: pass.qr_token,
    });

    // 4. Log manual send action in audit_logs
    await logAuditEvent({
      action_type: 'email_sent',
      performed_by: session.email,
      user_role: session.role,
      roll_no: studentRollNo,
      student_name: studentName,
      details: {
        sent_to_email: studentEmail,
        api_used: sendResult.apiUsed,
        manual_trigger: true,
        attachment: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Pass emailed with PDF attachment to ${studentEmail}!`,
      api_used: sendResult.apiUsed,
      pass_status: 'email_sent',
    });
  } catch (err) {
    console.error('Send pass email error:', err);
    return NextResponse.json({ success: false, message: 'Server error while sending email pass' }, { status: 500 });
  }
}
