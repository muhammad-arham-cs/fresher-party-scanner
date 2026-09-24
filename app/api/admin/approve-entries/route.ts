import { NextRequest, NextResponse } from 'next/server';
import { checkAdminSession } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase';
import { generateAndUploadPass, generateRandomTicketId } from '@/lib/pass-generator';
import { generateQRCode } from '@/lib/qrcode';
import { enqueueEmail, recordDirectEmailSent } from '@/lib/email-queue';
import { checkEmailQuota, incrementEmailQuota } from '@/lib/email-quota';
import { sendEmailWithFailover } from '@/lib/email-service';
import { buildPassAttachment, buildPassEmailHtml } from '@/lib/pass-email-helpers';
import { logAuditEvent } from '@/lib/audit';
import { v4 as uuidv4 } from 'uuid';

interface EntryRow {
  name: string;
  roll_no: string;
  email?: string;
  department: string;
  batch: string;
  section?: string;
  society?: string;
}

const HARDCODED_EXPIRY = '2026-09-30 23:59:59';

export async function POST(req: NextRequest) {
  try {
    const session = await checkAdminSession();
    if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

    const { entries }: { entries: EntryRow[] } = await req.json();
    if (!entries || entries.length === 0) {
      return NextResponse.json({ success: false, message: 'No entries provided' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const results: { roll_no: string; status: string; error?: string }[] = [];
    let emailsSent = 0;
    let emailsQueued = 0;

    for (const entry of entries) {
      try {
        const cleanRoll = entry.roll_no.trim();

        // Check for existing pass
        const { data: existing } = await supabase
          .from('approved_passes')
          .select('id, roll_no, section')
          .ilike('roll_no', cleanRoll)
          .maybeSingle();

        if (existing) {
          results.push({ roll_no: cleanRoll, status: 'skipped', error: 'Already has a pass' });
          continue;
        }

        const qr_token = uuidv4();

        // Generate random 5-digit ticket ID (digits 1-9) and ensure uniqueness
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

        const society = entry.society || detectSociety(entry.department);

        // Generate QR code for storage & email
        const qrDataUrl = await generateQRCode(ticket_id);
        const qrBase64 = qrDataUrl.split(',')[1];
        const qrBuffer = Buffer.from(qrBase64, 'base64');
        const qrFileName = `qr-codes/${cleanRoll.replace(/\//g, '-')}-${qr_token}.png`;

        await supabase.storage.from('passes').upload(qrFileName, qrBuffer, {
          contentType: 'image/png',
          upsert: true,
        });

        // Generate compressed PDF pass with ticket_id
        const studentData = {
          name: entry.name.trim(),
          roll_no: cleanRoll,
          department: entry.department.trim(),
          batch: entry.batch.trim(),
          section: ticket_id,
          society,
          qr_token,
          ticket_id,
        };

        const { signedUrl: passPdfUrl } = await generateAndUploadPass(studentData);

        const now = new Date().toISOString();
        const cacheExpires = new Date(Date.now() + 60 * 60 * 1000).toISOString();

        // Insert into approved_passes with defensive fallback for ticket_id
        const passRecord: Record<string, unknown> = {
          roll_no: cleanRoll,
          name: entry.name.trim(),
          email: entry.email?.trim() || null,
          department: entry.department.trim(),
          batch: entry.batch.trim(),
          section: ticket_id,
          society,
          qr_token,
          ticket_id,
          pass_status: 'generated',
          source: 'excel_automated',
          is_society_member: false,
          entry_created_by: session.email,
          pass_generated_at: now,
          pass_pdf_url: passPdfUrl,
          expires_at: HARDCODED_EXPIRY,
          pass_pdf_cached_url: passPdfUrl,
          pass_pdf_cache_expires: cacheExpires,
        };

        let insertResult = await supabase.from('approved_passes').insert(passRecord).select('id').single();
        if (insertResult.error && insertResult.error.message?.includes('ticket_id')) {
          delete passRecord.ticket_id;
          insertResult = await supabase.from('approved_passes').insert(passRecord).select('id').single();
        }

        const passId = insertResult.data?.id;

        // Dispatch Email: Send directly with PDF attached if quota allows, else enqueue
        const studentEmail = entry.email?.trim();
        if (studentEmail && studentEmail.includes('@')) {
          const quota = await checkEmailQuota();

          if (quota.canSend) {
            try {
              // Build attachment and branded email
              const attachments = await buildPassAttachment(cleanRoll, qr_token, studentData);
              const htmlContent = buildPassEmailHtml(entry.name.trim(), cleanRoll);

              const sendResult = await sendEmailWithFailover(
                studentEmail,
                '🎉 Your Fresher Party 2026 Pass is Ready!',
                htmlContent,
                attachments
              );

              if (sendResult.status === 'sent') {
                // Update pass status to email_sent
                if (passId) {
                  await supabase
                    .from('approved_passes')
                    .update({ pass_status: 'email_sent', pass_sent_at: new Date().toISOString() })
                    .eq('id', passId);
                }

                // Increment quota counter
                await incrementEmailQuota(sendResult.apiUsed || undefined, 1);

                // Record in history log
                await recordDirectEmailSent({
                  student_name: entry.name.trim(),
                  email: studentEmail,
                  roll_no: cleanRoll,
                  department: entry.department.trim(),
                  batch: entry.batch.trim(),
                  society,
                  qr_token,
                });

                // Audit log
                await logAuditEvent({
                  action_type: 'email_sent',
                  performed_by: session.email,
                  user_role: session.role,
                  roll_no: cleanRoll,
                  student_name: entry.name.trim(),
                  details: {
                    sent_to_email: studentEmail,
                    api_used: sendResult.apiUsed,
                    batch_generated: true,
                    attachment: true,
                  },
                });

                emailsSent++;
              } else {
                // Sending failed -> enqueue for background retry
                await enqueueEmail({
                  student_name: entry.name.trim(),
                  email: studentEmail,
                  roll_no: cleanRoll,
                  department: entry.department.trim(),
                  batch: entry.batch.trim(),
                  society,
                  qr_token,
                  pass_pdf_url: passPdfUrl,
                });
                emailsQueued++;
              }
            } catch (mailErr) {
              console.error(`Email send error for ${cleanRoll}, queueing fallback:`, mailErr);
              await enqueueEmail({
                student_name: entry.name.trim(),
                email: studentEmail,
                roll_no: cleanRoll,
                department: entry.department.trim(),
                batch: entry.batch.trim(),
                society,
                qr_token,
                pass_pdf_url: passPdfUrl,
              });
              emailsQueued++;
            }
          } else {
            // Quota limit reached -> safely queue for background dispatcher
            await enqueueEmail({
              student_name: entry.name.trim(),
              email: studentEmail,
              roll_no: cleanRoll,
              department: entry.department.trim(),
              batch: entry.batch.trim(),
              society,
              qr_token,
              pass_pdf_url: passPdfUrl,
            });
            emailsQueued++;
          }
        }

        results.push({ roll_no: cleanRoll, status: 'generated' });
      } catch (entryErr) {
        console.error(`Error processing ${entry.roll_no}:`, entryErr);
        results.push({ roll_no: entry.roll_no, status: 'error', error: 'Processing failed' });
      }
    }

    const processedCount = results.filter((r) => r.status !== 'error' && r.status !== 'skipped').length;
    const skippedCount = results.filter((r) => r.status === 'skipped').length;

    let message = `${processedCount} passes generated!`;
    if (emailsSent > 0) message += ` ${emailsSent} emails sent directly with PDF pass attached.`;
    if (emailsQueued > 0) message += ` ${emailsQueued} emails queued for delivery.`;
    if (skippedCount > 0) message += ` ${skippedCount} existing passes skipped.`;

    return NextResponse.json({
      success: true,
      message,
      total: entries.length,
      processed: processedCount,
      emails_sent: emailsSent,
      emails_queued: emailsQueued,
      skipped: skippedCount,
      results,
    });
  } catch (err) {
    console.error('Approve entries error:', err);
    return NextResponse.json({ success: false, message: 'Server error processing approvals' }, { status: 500 });
  }
}

function detectSociety(department: string): string {
  const dept = department.toUpperCase();
  if (dept.includes('CS') || dept.includes('COMPUTER SCIENCE')) return 'ACIS';
  if (dept.includes('AI') || dept.includes('ARTIFICIAL')) return 'AIS';
  if (dept.includes('DS') || dept.includes('DATA')) return 'ADSS';
  if (dept.includes('CY') || dept.includes('CYBER')) return 'ACSS';
  return 'General';
}
