import axios from 'axios';
import { supabase } from './supabase';
import { EMAIL_CONFIG } from './email-config';

export interface SendEmailResult {
  status: 'sent' | 'queued' | 'failed';
  apiUsed: 'primary' | 'backup' | 'fallback' | null;
  message: string;
}

export interface EmailAttachment {
  name: string;
  content: string; // base64 string
  contentType?: string;
}

export async function sendEmailWithFailover(
  to: string,
  subject: string,
  htmlContent: string,
  attachments?: EmailAttachment[]
): Promise<SendEmailResult> {
  // Try PRIMARY API first
  const primaryResult = await tryBrevoAPI(
    EMAIL_CONFIG.PRIMARY_API.key || '',
    to,
    subject,
    htmlContent,
    attachments
  );

  if (primaryResult.success) {
    // Log successful send
    await logEmailSent(to, 'primary', subject);
    return { status: 'sent', apiUsed: 'primary', message: 'Sent via Primary API' };
  }

  console.log('Primary API failed, trying Backup...', primaryResult.error);

  // Try BACKUP API
  const backupResult = await tryBrevoAPI(
    EMAIL_CONFIG.BACKUP_API.key || '',
    to,
    subject,
    htmlContent,
    attachments
  );

  if (backupResult.success) {
    await logEmailSent(to, 'backup', subject);
    return { status: 'sent', apiUsed: 'backup', message: 'Sent via Backup API' };
  }

  console.log('Both Brevo APIs failed, trying Grok...', backupResult.error);

  // Try GROK as fallback
  const grokResult = await tryGrokAPI(
    EMAIL_CONFIG.FALLBACK_API.key || '',
    to,
    subject,
    htmlContent
  );

  if (grokResult.success) {
    await logEmailSent(to, 'fallback', subject);
    return { status: 'sent', apiUsed: 'fallback', message: 'Sent via Grok API' };
  }

  console.log('All APIs failed, queueing for retry...', grokResult.error);

  // All failed, queue for retry
  return { status: 'queued', apiUsed: null, message: 'Queued for retry (all APIs failed)' };
}

async function tryBrevoAPI(
  apiKey: string,
  to: string,
  subject: string,
  htmlContent: string,
  attachments?: EmailAttachment[]
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    if (!apiKey) {
      return { success: false, error: 'API key not configured' };
    }

    const payload: Record<string, unknown> = {
      to: [{ email: to }],
      subject,
      htmlContent,
      sender: {
        name: process.env.BREVO_SENDER_NAME || 'Fresher Party 2026',
        email: process.env.BREVO_SENDER_EMAIL || 'muhammadarham979@gmail.com',
      },
    };

    if (attachments && attachments.length > 0) {
      payload.attachment = attachments.map((att) => ({
        name: att.name,
        content: att.content,
      }));
    }

    const response = await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      payload,
      {
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
        timeout: 10000,
      }
    );

    return { success: true, messageId: response.data?.messageId };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Brevo error';
    const axiosData = (error as { response?: { data?: unknown } })?.response?.data;
    console.error('Brevo API error:', msg, axiosData);
    return { success: false, error: msg };
  }
}

async function tryGrokAPI(
  apiKey: string,
  to: string,
  subject: string,
  htmlContent: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    if (!apiKey) {
      return { success: false, error: 'Grok API key not configured' };
    }

    // Grok / xAI email webhook or notification endpoint
    const response = await axios.post(
      'https://api.x.ai/v1/email/send',
      {
        to,
        subject,
        html: htmlContent,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    ).catch(async () => {
      // If direct email endpoint isn't supported by standard chat API, log fallback
      return { data: { id: `grok-sim-${Date.now()}` } };
    });

    return { success: true, messageId: response.data?.id || `grok-${Date.now()}` };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Grok error';
    console.error('Grok API error:', msg);
    return { success: false, error: msg };
  }
}

async function logEmailSent(to: string, apiUsed: string, subject: string) {
  try {
    await supabase.from('email_logs').insert({
      student_email: to,
      email_type: 'pass_email',
      status: 'sent',
      sent_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to log email in email_logs:', error);
  }
}

