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

/**
 * Build the branded HTML email body for a pass email.
 * Now says "Your pass is attached" instead of a download link.
 */
export function buildPassEmailHtml(studentName: string, rollNo: string): string {
  return `
    <div style="font-family:'Inter',Arial,sans-serif;max-width:540px;margin:0 auto;background:#0f172a;border-radius:16px;overflow:hidden;color:#ffffff;">
      <div style="background:linear-gradient(135deg,#2563eb,#7c3aed);padding:28px 24px;text-align:center;">
        <h1 style="color:#ffffff;margin:0 0 6px 0;font-size:22px;font-weight:800;">🎉 FRESHER PARTY 2026</h1>
        <p style="color:rgba(255,255,255,0.85);margin:0;font-size:13px;letter-spacing:1.5px;">CAMPUS OF I&CS · DUET — OFFICIAL ENTRY PASS</p>
      </div>
      <div style="padding:28px 24px;background:#1e293b;margin:20px;border-radius:14px;border:1px solid #334155;">
        <p style="color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:0 0 4px 0;">STUDENT NAME</p>
        <p style="color:#ffffff;font-size:18px;font-weight:700;margin:0 0 16px 0;">${studentName}</p>
        <p style="color:#94a3b8;font-size:11px;text-transform:uppercase;margin:0 0 4px 0;">ROLL NUMBER</p>
        <p style="color:#60a5fa;font-size:15px;font-weight:600;margin:0 0 16px 0;">${rollNo}</p>
        <div style="text-align:center;padding:20px 0 12px 0;">
          <div style="display:inline-block;padding:14px 28px;background:linear-gradient(135deg,#10b981,#059669);color:#ffffff;border-radius:12px;font-weight:700;font-size:15px;box-shadow:0 4px 14px rgba(16,185,129,0.4);">
            📎 Your Entry Pass (PDF) is Attached Below
          </div>
        </div>
        <p style="color:#94a3b8;font-size:12px;text-align:center;margin:12px 0 0 0;">
          Open the attached PDF file and show the QR code on your pass at the gate.
        </p>
      </div>
      <div style="padding:16px 24px 20px;text-align:center;">
        <p style="color:#64748b;font-size:11px;margin:0;">
          Fresher Party 2026 · Campus of I&CS · DUET · Non-transferable
        </p>
        <p style="color:#475569;font-size:10px;margin:8px 0 0 0;">
          Valid until 30 September 2026 · Strictly single use only
        </p>
      </div>
    </div>
  `;
}
