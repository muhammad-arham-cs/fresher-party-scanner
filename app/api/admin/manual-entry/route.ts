import { NextRequest, NextResponse } from 'next/server';
import { checkAdminSession } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase';
import { generateAndUploadPass, generateRandomTicketId } from '@/lib/pass-generator';
import { generateQRCode } from '@/lib/qrcode';
import { enqueueEmail, recordDirectEmailSent } from '@/lib/email-queue';
import { checkEmailQuota, incrementEmailQuota } from '@/lib/email-quota';
import { sendEmailWithFailover } from '@/lib/email-service';
import { logAuditEvent } from '@/lib/audit';
import { buildPassAttachment, buildPassEmailHtml } from '@/lib/pass-email-helpers';
import { v4 as uuidv4 } from 'uuid';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLL_NO_REGEX = /^\d{2}[A-Za-z]-[A-Za-z]{2,4}-\d{3,4}$/i;
const HARDCODED_EXPIRY = '2026-09-30 23:59:59';

export async function POST(req: NextRequest) {
  try {
    const session = await checkAdminSession();
    if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { name, roll_no, email, department, batch, section, society, is_society_member, send_email_now } = body;

    if (!name || !roll_no || !email || !department || !batch) {
      return NextResponse.json({
        success: false,
        message: 'Full name, roll number, email, department, and batch are required',
      }, { status: 400 });
    }

    const cleanName = name.trim();
    const cleanRollNo = roll_no.trim();
    const cleanEmail = email.trim();
    const cleanDept = department.trim();
    const cleanBatch = batch.trim();
    const cleanSection = section?.trim() || null;
    const cleanSociety = society?.trim() || '';

    if (!ROLL_NO_REGEX.test(cleanRollNo)) {
      return NextResponse.json({
        success: false,
        message: `Invalid roll number format: "${cleanRollNo}". Expected format: 24F-CS-001 or 23E-EE-045`,
      }, { status: 400 });
    }

    if (!EMAIL_REGEX.test(cleanEmail)) {
      return NextResponse.json({ success: false, message: 'Invalid email address format' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Check existing pass
    const { data: existing } = await supabase
      .from('approved_passes')
      .select('id, roll_no, pass_pdf_url, pass_status')
      .eq('roll_no', cleanRollNo)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        success: false,
        message: 'This student already has an approved pass',
        existing_pass: {
          roll_no: existing.roll_no,
          pass_pdf_url: existing.pass_pdf_url,
          pass_status: existing.pass_status,
        },
      }, { status: 409 });
    }

    const qr_token = uuidv4();
    
    // Generate completely random 5-digit ticket ID (digits 1-9 only) and ensure uniqueness
    let ticket_id = generateRandomTicketId();
    for (let i = 0; i < 15; i++) {
      const { data: dup } = await supabase
        .from('approved_passes')
        .select('id')
        .or(`section.eq.${ticket_id}`)
        .maybeSingle();
      if (!dup) break;
      ticket_id = generateRandomTicketId();
    }

    // Generate QR code PNG and upload
    const qrDataUrl = await generateQRCode(ticket_id);
    const qrBase64 = qrDataUrl.split(',')[1];
    const qrBuffer = Buffer.from(qrBase64, 'base64');
    const qrFileName = `qr-codes/${cleanRollNo.replace(/\//g, '-')}-${qr_token}.png`;
    await supabase.storage.from('passes').upload(qrFileName, qrBuffer, {
      contentType: 'image/png',
      upsert: true,
    });

    // Generate compressed PDF pass and 24h signed URL
    const { signedUrl: passPdfUrl } = await generateAndUploadPass({
      name: cleanName,
      roll_no: cleanRollNo,
      department: cleanDept,
      batch: cleanBatch,
      section: ticket_id,
      society: cleanSociety,
      qr_token,
      ticket_id,
    });

    const now = new Date().toISOString();
    const cacheExpires = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    // Insert into approved_passes with defensive fallback for ticket_id column
    const insertPayload: Record<string, unknown> = {
      roll_no: cleanRollNo,
      name: cleanName,
      email: cleanEmail,
      department: cleanDept,
      batch: cleanBatch,
      section: ticket_id, // Store ticket_id in section so it's guaranteed queryable
      society: cleanSociety,
      qr_token,
      ticket_id,
      pass_status: 'generated',
      source: 'manual_entry',
      is_society_member: is_society_member || false,
      entry_created_by: session.email,
      pass_generated_at: now,
      pass_pdf_url: passPdfUrl,
      expires_at: HARDCODED_EXPIRY,
      pass_pdf_cached_url: passPdfUrl,
      pass_pdf_cache_expires: cacheExpires,
    };

    let { data: newPass, error: insertError } = await supabase
      .from('approved_passes')
      .insert(insertPayload)
      .select()
      .single();

    if (insertError && insertError.message?.includes('ticket_id')) {
      delete insertPayload.ticket_id;
      const retry = await supabase
        .from('approved_passes')
        .insert(insertPayload)
        .select()
        .single();
      newPass = retry.data;
      insertError = retry.error;
    }

    if (insertError) throw insertError;

    // Send email immediately if requested and quota allows, otherwise queue
    let emailSent = false;
    let emailQueued = false;
    let apiUsed: string | null = null;

    if (cleanEmail && cleanEmail.includes('@')) {
      const shouldSendImmediately = send_email_now !== false;
      const quota = await checkEmailQuota();

      if (shouldSendImmediately && quota.canSend) {
        // Build PDF attachment
        const attachments = await buildPassAttachment(cleanRollNo, qr_token, {
          name: cleanName,
          roll_no: cleanRollNo,
          department: cleanDept,
          batch: cleanBatch,
          section: cleanSection || undefined,
          society: cleanSociety,
          qr_token,
          ticket_id,
        });

        const htmlContent = buildPassEmailHtml(cleanName, cleanRollNo);

        const sendResult = await sendEmailWithFailover(
          cleanEmail,
          '🎉 Your Fresher Party 2026 Pass is Ready!',
          htmlContent,
          attachments
        );

        if (sendResult.status === 'sent') {
          emailSent = true;
          apiUsed = sendResult.apiUsed;

          // Update pass status
          await supabase
            .from('approved_passes')
            .update({
              pass_status: 'email_sent',
              pass_sent_at: new Date().toISOString(),
            })
            .eq('id', newPass.id);

          // Increment daily & hourly quota
          await incrementEmailQuota(sendResult.apiUsed || undefined, 1);

          // Record in email_queue as sent so it appears in email queue dashboard
          await recordDirectEmailSent({
            student_name: cleanName,
            email: cleanEmail,
            roll_no: cleanRollNo,
            department: cleanDept,
            batch: cleanBatch,
            society: cleanSociety,
            qr_token,
            pass_pdf_url: passPdfUrl,
          });
        }
      }

      // If not sent immediately, enqueue for cron processing
      if (!emailSent) {
        await enqueueEmail({
          student_name: cleanName,
          email: cleanEmail,
          roll_no: cleanRollNo,
          department: cleanDept,
          batch: cleanBatch,
          society: cleanSociety,
          qr_token,
          pass_pdf_url: passPdfUrl,
        });
        emailQueued = true;
      }
    }

    // Security Update #8: Log manual entry creation to audit_logs
    await logAuditEvent({
      action_type: 'manual_entry_created',
      performed_by: session.email,
      user_role: session.role,
      roll_no: cleanRollNo,
      student_name: cleanName,
      details: {
        department: cleanDept,
        batch: cleanBatch,
        society: cleanSociety,
        email_sent: emailSent,
        email_queued: emailQueued,
        api_used: apiUsed,
      },
    });

    return NextResponse.json({
      success: true,
      message: emailSent
        ? `Pass created and emailed directly to ${cleanEmail}!`
        : emailQueued
        ? 'Pass created successfully, email added to delivery queue.'
        : 'Pass created successfully.',
      pass: newPass,
      email_sent: emailSent,
      email_queued: emailQueued,
      pass_pdf_url: passPdfUrl,
      roll_no: cleanRollNo,
      name: cleanName,
      email: cleanEmail,
    });
  } catch (err) {
    console.error('Manual entry error:', err);
    return NextResponse.json({ success: false, message: 'Server error creating manual entry' }, { status: 500 });
  }
}
