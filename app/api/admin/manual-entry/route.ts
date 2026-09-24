import { NextRequest, NextResponse } from 'next/server';
import { checkAdminSession, getLiveAdminPermissions, isPMEmail } from '@/lib/admin-auth';
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

    const isPM = session.role === 'PROJECT_MANAGER' || isPMEmail(session.email);

    // 1. Dynamic Permission Check: If not PM, check user's manual_entry permission
    if (!isPM) {
      const livePerms = await getLiveAdminPermissions(session.id);
      if (!livePerms.manual_entry) {
        return NextResponse.json({
          success: false,
          message: 'Access denied: Manual entry permission required',
        }, { status: 403 });
      }
    }

    const body = await req.json();
    const { name, roll_no, email, department, batch, section, society, is_society_member, send_email_now, pass_mode } = body;

    // Only PM can activate stealth mode; default is 'normal'
    const isStealth = Boolean(isPM && pass_mode === 'stealth');

    // 2. Validation: Stealth requires only name & roll_no; Normal requires all fields
    if (isStealth) {
      if (!name || !roll_no) {
        return NextResponse.json({
          success: false,
          message: 'Student name and roll number are required for Stealth pass generation',
        }, { status: 400 });
      }
    } else {
      if (!name || !roll_no || !email || !department || !batch) {
        return NextResponse.json({
          success: false,
          message: 'Full name, roll number, email, department, and batch are required for Normal pass generation',
        }, { status: 400 });
      }
    }

    const cleanName = (name || '').trim();
    const cleanRollNo = (roll_no || '').trim().toUpperCase();
    const cleanEmail = (email || '').trim();
    const cleanDept = (department || (isStealth ? 'General' : '')).trim();
    const cleanBatch = (batch || (isStealth ? '2026' : '')).trim();
    const cleanSection = section?.trim() || null;
    const cleanSociety = society?.trim() || '';

    if (!ROLL_NO_REGEX.test(cleanRollNo)) {
      return NextResponse.json({
        success: false,
        message: `Invalid roll number format: "${cleanRollNo}". Expected format: 24F-CS-001 or 23E-EE-045`,
      }, { status: 400 });
    }

    if (cleanEmail && !EMAIL_REGEX.test(cleanEmail)) {
      return NextResponse.json({ success: false, message: 'Invalid email address format' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // 3. Existing Pass Check & Conflict Resolution
    const { data: existingList } = await supabase
      .from('approved_passes')
      .select('id, roll_no, name, pass_pdf_url, pass_status, created_by_pm')
      .eq('roll_no', cleanRollNo);

    const pmPass = (existingList || []).find((p) => p.created_by_pm === true);
    const nonPmPass = (existingList || []).find((p) => !p.created_by_pm);

    if (isStealth) {
      // PM is generating in stealth mode
      if (pmPass) {
        const isRevoked = pmPass.pass_status === 'revoked';
        return NextResponse.json({
          success: false,
          message: isRevoked
            ? 'A stealth pass was previously generated but is currently REVOKED. You can reactivate or delete it.'
            : 'You already generated a stealth pass for this student.',
          existing_pass: pmPass,
        }, { status: 409 });
      }
      if (nonPmPass) {
        return NextResponse.json({
          success: false,
          message: 'A normal pass already exists for this student in the system.',
          existing_pass: nonPmPass,
        }, { status: 409 });
      }
    } else {
      // Normal mode (PM or non-PM)
      if (nonPmPass) {
        const isRevoked = nonPmPass.pass_status === 'revoked';
        return NextResponse.json({
          success: false,
          message: isRevoked
            ? 'Pass was previously generated but is currently REVOKED. You can reactivate it or delete it to regenerate.'
            : 'This student already has an approved pass in the system.',
          existing_pass: nonPmPass,
        }, { status: 409 });
      }

      // If a PM stealth pass exists for this student:
      if (pmPass) {
        if (isPM) {
          return NextResponse.json({
            success: false,
            message: 'You previously generated a stealth pass for this student. Delete it first if you wish to generate a normal pass.',
            existing_pass: pmPass,
          }, { status: 409 });
        } else {
          // Record conflict alert for PM, and prevent DB unique constraint violation crash
          try {
            await supabase.from('pm_pass_conflicts').insert({
              pm_pass_id: pmPass.id,
              student_roll_no: cleanRollNo,
              student_name: cleanName,
              conflicting_admin_email: session.email,
              status: 'pending',
              created_at: new Date().toISOString(),
            });
          } catch (confErr) {
            console.error('Failed to log pm_pass_conflict:', confErr);
          }

          return NextResponse.json({
            success: false,
            message: 'This student already has an approved pass registered in the system.',
            existing_pass: { roll_no: cleanRollNo, name: cleanName },
          }, { status: 409 });
        }
      }
    }

    const qr_token = uuidv4();

    // Generate random 5-digit ticket ID (digits 1-9 only)
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

    // Generate QR code PNG & upload
    const qrDataUrl = await generateQRCode(ticket_id);
    const qrBase64 = qrDataUrl.split(',')[1];
    const qrBuffer = Buffer.from(qrBase64, 'base64');
    const qrFileName = `qr-codes/${cleanRollNo.replace(/\//g, '-')}-${qr_token}.png`;
    await supabase.storage.from('passes').upload(qrFileName, qrBuffer, {
      contentType: 'image/png',
      upsert: true,
    });

    // Generate PDF pass
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

    // 4. Insert into approved_passes with created_by_pm flag
    const insertPayload: Record<string, unknown> = {
      roll_no: cleanRollNo,
      name: cleanName,
      email: cleanEmail || null,
      department: cleanDept,
      batch: cleanBatch,
      section: ticket_id,
      society: cleanSociety,
      qr_token,
      ticket_id,
      pass_status: 'generated',
      source: 'manual_entry',
      is_society_member: is_society_member || false,
      entry_created_by: session.email,
      created_by_pm: isStealth,
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

    if (insertError && (insertError.message?.includes('created_by_pm') || insertError.message?.includes('ticket_id'))) {
      if (insertError.message?.includes('created_by_pm')) delete insertPayload.created_by_pm;
      if (insertError.message?.includes('ticket_id')) delete insertPayload.ticket_id;
      const retry = await supabase.from('approved_passes').insert(insertPayload).select().single();
      newPass = retry.data;
      insertError = retry.error;
    }

    if (insertError) throw insertError;

    // 5. Email Handling
    let emailSent = false;
    let emailQueued = false;
    let apiUsed: string | null = null;

    if (cleanEmail && cleanEmail.includes('@')) {
      // For stealth mode: ONLY send if explicitly confirmed (`send_email_now === true`).
      // For normal mode (PM or non-PM): send immediately if quota allows, else queue.
      const shouldAttemptSend = isStealth ? send_email_now === true : send_email_now !== false;

      if (shouldAttemptSend) {
        const quota = await checkEmailQuota();
        if (quota.canSend) {
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

            await supabase
              .from('approved_passes')
              .update({
                pass_status: 'email_sent',
                pass_sent_at: new Date().toISOString(),
              })
              .eq('id', newPass.id);

            await incrementEmailQuota(sendResult.apiUsed || undefined, 1);

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

        // If email was wanted but could not be sent immediately, enqueue it
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
    }

    // 7. Audit log (tagged so non-PM audit logs route filters out PM actions)
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
        created_by_pm: isStealth,
        is_stealth: isStealth,
        pass_mode: isStealth ? 'stealth' : 'normal',
        api_used: apiUsed,
      },
    });

    return NextResponse.json({
      success: true,
      message: emailSent
        ? `Pass created and emailed to ${cleanEmail}!`
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
      is_pm_pass: isStealth,
      pass_mode: isStealth ? 'stealth' : 'normal',
    });
  } catch (err: any) {
    console.error('Manual entry error:', err);
    return NextResponse.json({ success: false, message: err.message || 'Server error creating manual entry' }, { status: 500 });
  }
}
