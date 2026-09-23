/**
 * Brevo (SendinBlue) email service with dual-key failover.
 */

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

interface BrevoResult {
  success: boolean;
  error?: string;
}

interface SendEmailParams {
  to: string;
  subject: string;
  htmlContent: string;
  attachments?: { name: string; content: string; contentType: string }[];
}

async function sendWithFailover(params: SendEmailParams): Promise<BrevoResult> {
  const senderEmail = process.env.BREVO_SENDER_EMAIL || 'muhammadarham979@gmail.com';
  const senderName = process.env.BREVO_SENDER_NAME || 'Fresher Party 2026';
  const keys = [
    process.env.BREVO_API_KEY_1 || process.env.BREVO_API_KEY,
    process.env.BREVO_BACKUP_API_KEY || process.env.BREVO_API_KEY_2,
  ].filter(Boolean) as string[];

  if (keys.length === 0) return { success: false, error: 'No Brevo API keys configured' };

  const payload: Record<string, unknown> = {
    sender: { name: senderName, email: senderEmail },
    to: [{ email: params.to }],
    subject: params.subject,
    htmlContent: params.htmlContent,
  };

  if (params.attachments && params.attachments.length > 0) {
    payload.attachment = params.attachments.map((a) => ({
      name: a.name,
      content: a.content,
    }));
  }

  let lastError = '';
  for (let idx = 0; idx < keys.length; idx++) {
    try {
      const response = await fetch(BREVO_API_URL, {
        method: 'POST',
        headers: { accept: 'application/json', 'api-key': keys[idx], 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (response.ok) return { success: true };
      const err = await response.json().catch(() => null);
      lastError = err?.message || `HTTP ${response.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Network error';
    }
  }
  return { success: false, error: lastError };
}

/**
 * Send pass approval email with QR code image and PDF link.
 */
export async function sendPassEmail(params: {
  to: string;
  studentName: string;
  rollNo: string;
  department: string;
  batch: string;
  society: string;
  qrCodeUrl: string;
  passPdfUrl: string;
}): Promise<BrevoResult> {
  return sendWithFailover({
    to: params.to,
    subject: '🎉 Your Fresher Party 2026 Pass is Ready!',
    htmlContent: `
      <div style="font-family:'Inter',Arial,sans-serif;max-width:520px;margin:0 auto;background:#0f172a;border-radius:16px;overflow:hidden;">
        <!-- Header -->
        <div style="background:linear-gradient(135deg,#2563eb,#7c3aed);padding:32px 24px;text-align:center;">
          <h1 style="color:white;margin:0 0 4px 0;font-size:22px;font-weight:800;">🎉 FRESHER PARTY 2026</h1>
          <p style="color:rgba(255,255,255,0.8);margin:0;font-size:13px;letter-spacing:2px;">DUET ISLAMABAD — YOUR PASS IS READY</p>
        </div>

        <!-- Pass Card -->
        <div style="margin:24px;background:#1e293b;border:1px solid #334155;border-radius:16px;overflow:hidden;">
          <div style="padding:24px;border-bottom:1px dashed #334155;">
            <p style="color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:1px;margin:0 0 4px 0;">ATTENDEE</p>
            <p style="color:#f8fafc;font-size:20px;font-weight:700;margin:0 0 12px 0;">${params.studentName}</p>
            <p style="color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:1px;margin:0 0 4px 0;">ROLL NUMBER</p>
            <p style="color:#60a5fa;font-size:16px;font-weight:600;margin:0 0 12px 0;">${params.rollNo}</p>
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="padding-right:16px;">
                  <p style="color:#94a3b8;font-size:10px;text-transform:uppercase;margin:0 0 2px 0;">DEPARTMENT</p>
                  <p style="color:#f8fafc;font-size:13px;font-weight:600;margin:0;">${params.department}</p>
                </td>
                <td>
                  <p style="color:#94a3b8;font-size:10px;text-transform:uppercase;margin:0 0 2px 0;">BATCH</p>
                  <p style="color:#f8fafc;font-size:13px;font-weight:600;margin:0;">${params.batch}</p>
                </td>
              </tr>
            </table>
          </div>

          <!-- QR Code -->
          <div style="padding:24px;text-align:center;">
            <p style="color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:1px;margin:0 0 16px 0;">SCAN AT THE GATE</p>
            <div style="display:inline-block;padding:16px;background:white;border-radius:12px;">
              <img src="${params.qrCodeUrl}" alt="QR Pass" width="180" height="180" style="display:block;"/>
            </div>
          </div>

          <!-- Download PDF -->
          <div style="padding:16px 24px;text-align:center;background:rgba(37,99,235,0.1);">
            <a href="${params.passPdfUrl}" style="display:inline-block;padding:10px 24px;background:linear-gradient(135deg,#2563eb,#7c3aed);color:white;font-weight:600;text-decoration:none;border-radius:8px;font-size:13px;">
              📄 Download PDF Pass
            </a>
          </div>
        </div>

        <!-- Instructions -->
        <div style="padding:0 24px 32px;text-align:center;">
          <p style="color:#64748b;font-size:12px;margin:0;">
            Save this email or take a screenshot of the QR code.<br/>
            <strong style="color:#f59e0b;">⚠️ Do not share your pass with others.</strong>
          </p>
        </div>
      </div>
    `,
  });
}

/**
 * Send admin password setup email.
 */
export async function sendAdminInviteEmail(params: {
  to: string;
  name: string;
  role: string;
  setupUrl: string;
}): Promise<BrevoResult> {
  return sendWithFailover({
    to: params.to,
    subject: 'Set Up Your Admin Password — Fresher Party 2026',
    htmlContent: `
      <div style="font-family:'Inter',Arial,sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;background:#0f172a;color:#f8fafc;border-radius:16px;">
        <div style="text-align:center;margin-bottom:32px;">
          <h2 style="color:#f8fafc;margin:0 0 8px 0;">Welcome, ${params.name}!</h2>
          <p style="color:#94a3b8;margin:0;">You've been added to the Fresher Party 2026 Admin Panel as <strong style="color:#60a5fa;">${params.role}</strong>.</p>
        </div>
        <div style="text-align:center;margin-bottom:24px;">
          <a href="${params.setupUrl}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#2563eb,#7c3aed);color:white;font-weight:600;text-decoration:none;border-radius:12px;font-size:15px;">
            Set Your Password
          </a>
        </div>
        <p style="color:#94a3b8;font-size:12px;text-align:center;word-break:break-all;margin:0 0 16px 0;">
          Or copy link into browser:<br/>
          <a href="${params.setupUrl}" style="color:#60a5fa;text-decoration:underline;">${params.setupUrl}</a>
        </p>
        <p style="color:#64748b;font-size:12px;text-align:center;margin:0;">
          This link is valid for 1 hour. Contact the Project Manager if you need a new link.
        </p>
      </div>
    `,
  });
}

/**
 * Send rejection email to student.
 */
export async function sendRejectionEmail(params: {
  to: string;
  studentName: string;
  reason: string;
}): Promise<BrevoResult> {
  return sendWithFailover({
    to: params.to,
    subject: 'Fresher Party 2026 — Registration Update',
    htmlContent: `
      <div style="font-family:'Inter',Arial,sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;background:#0f172a;color:#f8fafc;border-radius:16px;">
        <h2 style="color:#f87171;margin:0 0 16px 0;">Registration Issue</h2>
        <p style="color:#94a3b8;">Hi ${params.studentName},</p>
        <p style="color:#94a3b8;">There was an issue with your registration data:</p>
        <div style="background:#1e293b;border:1px solid #ef4444;border-radius:12px;padding:16px;margin:16px 0;">
          <p style="color:#f87171;margin:0;">${params.reason}</p>
        </div>
        <p style="color:#94a3b8;font-size:13px;">Please contact the cabinet via WhatsApp for assistance.</p>
      </div>
    `,
  });
}
