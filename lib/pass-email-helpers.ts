import { createAdminClient } from '@/lib/supabase';
import { generatePassPDF, type PassStudent } from '@/lib/pass-generator';
import type { EmailAttachment } from '@/lib/email-service';

/**
 * Fetch an existing pass PDF from Supabase Storage and return it as a base64 string.
 * Falls back to regenerating the PDF if the file doesn't exist in storage.
 */
export async function getPassPdfAsBase64(
  rollNo: string,
  qrToken: string,
  student?: PassStudent
): Promise<{ base64: string; fileName: string } | null> {
  try {
    const supabase = createAdminClient();
    const cleanRollNo = rollNo.replace(/\//g, '-');
    const storageFileName = `passes/${cleanRollNo}-${qrToken}.pdf`;

    // Try downloading from Supabase Storage first
    const { data: fileData, error } = await supabase.storage
      .from('passes')
      .download(storageFileName);

    if (!error && fileData) {
      const arrayBuffer = await fileData.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const attachmentName = `FresherParty2026-Pass-${cleanRollNo}.pdf`;
      return { base64, fileName: attachmentName };
    }

    // If not in storage, regenerate PDF on the fly
    if (student) {
      console.log(`PDF not found in storage for ${rollNo}, regenerating...`);
      const pdfDataUri = await generatePassPDF(student);
      const base64 = pdfDataUri.split(',')[1];
      const attachmentName = `FresherParty2026-Pass-${cleanRollNo}.pdf`;
      return { base64, fileName: attachmentName };
    }

    console.error(`Cannot get PDF for ${rollNo}: not in storage and no student data to regenerate`);
    return null;
  } catch (err) {
    console.error('Error getting pass PDF as base64:', err);
    return null;
  }
}

/**
 * Build the Brevo email attachment array for a pass PDF.
 */
export async function buildPassAttachment(
  rollNo: string,
  qrToken: string,
  student?: PassStudent
): Promise<EmailAttachment[]> {
  const pdf = await getPassPdfAsBase64(rollNo, qrToken, student);
  if (!pdf) return [];
  
  return [
    {
      name: pdf.fileName,
      content: pdf.base64,
      contentType: 'application/pdf',
    },
  ];
}

export interface PassEmailDetails {
  ticketId?: string;
  department?: string;
  batch?: string;
}

/**
 * Build the branded HTML email body for a pass email.
 * Professional white-card template with student details and attached PDF notice.
 */
export function buildPassEmailHtml(
  studentName: string,
  rollNo: string,
  details?: PassEmailDetails
): string {
  const ticketId = details?.ticketId;
  const department = details?.department;
  const batch = details?.batch;

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 20px auto; padding: 32px 28px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); color: #1e293b;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h2 style="color: #2563eb; font-size: 24px; font-weight: 800; margin: 0 0 8px 0; letter-spacing: -0.5px;">
          🎉 Fresher Party 2026 Pass
        </h2>
      </div>

      <p style="font-size: 15px; color: #1e293b; line-height: 1.6; margin: 0 0 12px 0;">
        Dear <strong>${studentName}</strong>,
      </p>
      <p style="font-size: 15px; color: #334155; line-height: 1.6; margin: 0 0 20px 0;">
        Your official entry pass for <strong>Fresher Party 2026</strong> has been generated successfully!
      </p>

      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 18px 20px; border-radius: 12px; margin: 20px 0;">
        ${ticketId ? `<p style="margin: 6px 0; font-size: 14px; color: #334155;"><strong>Ticket ID:</strong> <span style="font-family: monospace; font-weight: 700; color: #0f172a;">${ticketId}</span></p>` : ''}
        <p style="margin: 6px 0; font-size: 14px; color: #334155;"><strong>Roll No:</strong> <span style="font-family: monospace; font-weight: 700; color: #0f172a;">${rollNo}</span></p>
        ${department ? `<p style="margin: 6px 0; font-size: 14px; color: #334155;"><strong>Department:</strong> ${department}</p>` : ''}
        ${batch ? `<p style="margin: 6px 0; font-size: 14px; color: #334155;"><strong>Batch:</strong> ${batch}</p>` : ''}
      </div>

      <p style="font-size: 14px; color: #475569; line-height: 1.6; margin: 0 0 20px 0;">
        Your pass is attached to this email as a PDF. Please download it and have the QR code ready on your phone when arriving at the entry gate.
      </p>

      <!-- IMPORTANT WARNING NOTICE FOR ATTENDEE -->
      <div style="background-color: #fff1f2; border: 1px solid #fecdd3; border-left: 4px solid #e11d48; padding: 14px 18px; border-radius: 12px; margin: 20px 0;">
        <p style="margin: 0 0 6px 0; font-size: 13px; font-weight: 800; color: #9f1239; letter-spacing: 0.3px;">
          ⚠️ IMPORTANT NOTICE — STRICT ONE-TIME ENTRY:
        </p>
        <p style="margin: 0; font-size: 13px; color: #881337; line-height: 1.5;">
          Please <strong>do not share your pass or QR code with anyone</strong>. Each pass QR code is <strong>strictly single-use and valid only once at the gate</strong>. If your pass is shared, duplicate-scanned, or used by anyone else, entry will be permanently denied and event organizers will not be responsible for any issues caused ahead.
        </p>
      </div>

      <div style="border-top: 1px solid #f1f5f9; padding-top: 20px; text-align: center;">
        <p style="color: #64748b; font-size: 13px; font-weight: 600; margin: 0 0 4px 0;">
          Campus of Information and Computing Sciences
        </p>
        <p style="color: #94a3b8; font-size: 12px; margin: 0 0 10px 0;">
          Dawood University of Engineering & Technology
        </p>
        <p style="color: #cbd5e1; font-size: 11px; margin: 0; letter-spacing: 0.5px;">
          Powered by <strong style="color: #94a3b8;">Muhammad Arham</strong>
        </p>
      </div>
    </div>
  `;
}


