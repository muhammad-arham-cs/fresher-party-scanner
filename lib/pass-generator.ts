import fs from 'fs';
import path from 'path';
import { jsPDF } from 'jspdf';
import { createAdminClient } from '@/lib/supabase';
import { generateQRCode } from '@/lib/qrcode';

export interface PassStudent {
  name: string;
  roll_no: string;
  department: string;
  batch: string;
  section?: string;
  society?: string;
  qr_token: string;
  ticket_id?: string;
}

let cachedTemplateBase64: string | null = null;

function getTemplateBase64(): string {
  if (cachedTemplateBase64) return cachedTemplateBase64;
  const templatePath = path.join(process.cwd(), 'public', 'pass-template.jpg');
  const buffer = fs.readFileSync(templatePath);
  cachedTemplateBase64 = 'data:image/jpeg;base64,' + buffer.toString('base64');
  return cachedTemplateBase64;
}

/**
 * Generate a random 5-digit Ticket ID with digits strictly between 1 and 9 (e.g. FP26-73914).
 * Completely non-sequential, random, and containing no letters and no zeros.
 */
export function generateRandomTicketId(): string {
  const digits = '123456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += digits[Math.floor(Math.random() * digits.length)];
  }
  return `FP26-${code}`;
}

/**
 * Format a unique Ticket ID from existing value or generate a random 5-digit numeric one.
 */
export function formatTicketId(qr_token?: string, existingTicketId?: string): string {
  if (existingTicketId && existingTicketId.trim()) return existingTicketId.trim().toUpperCase();
  return generateRandomTicketId();
}

/**
 * Generate a pass PDF for a student using the official Fresher's Party 2026 ticket template.
 * Renders Name, Roll No, Ticket ID, and QR code inside designated bounding boxes.
 * Returns the PDF as base64 data URI string.
 */
export async function generatePassPDF(student: PassStudent): Promise<string> {
  const ticketId = formatTicketId(student.qr_token, student.ticket_id);
  // QR code encodes the unique ticket ID for 100% consistency between visual pass & scanning
  const qrDataUrl = await generateQRCode(ticketId);

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [200, 100],
    compress: true,
  });

  // Background Ticket Artwork
  const templateBase64 = getTemplateBase64();
  doc.addImage(templateBase64, 'JPEG', 0, 0, 200, 100);

  // Center horizontal position for the right-stub text boxes
  const centerX = 165.5;

  // 1. NAME BOX
  doc.setFont('helvetica', 'bold');
  const cleanName = student.name.trim().toUpperCase();
  if (cleanName.length > 22) {
    doc.setFontSize(8);
  } else if (cleanName.length > 17) {
    doc.setFontSize(8.5);
  } else {
    doc.setFontSize(9.5);
  }
  doc.setTextColor(20, 25, 40);
  doc.text(cleanName, centerX, 21.8, { align: 'center' });

  // 2. ROLL NO BOX
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(20, 25, 40);
  doc.text(student.roll_no.trim().toUpperCase(), centerX, 37.6, { align: 'center' });

  // 3. TICKET ID BOX
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(20, 25, 40);
  doc.text(ticketId, centerX, 53.4, { align: 'center' });

  // 4. QR CODE (precisely centered inside the white dashed-border box)
  // Measured box bounds in template: x: [148.2 .. 177.7], y: [57.0 .. 85.2] -> Center: (163.0, 71.1)
  const qrSize = 27.0;
  const qrCenterX = 163.0;
  const qrCenterY = 71.1;
  const qrX = qrCenterX - (qrSize / 2); // 149.5 mm
  const qrY = qrCenterY - (qrSize / 2); // 57.6 mm
  doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);

  return doc.output('datauristring');
}

/**
 * Generate PDF and upload to Supabase Storage (Private Bucket).
 * Generates a 24-hour signed URL for email sending.
 */
export async function generateAndUploadPass(student: PassStudent): Promise<{
  signedUrl: string;
  filePath: string;
}> {
  const pdfDataUri = await generatePassPDF(student);
  const base64 = pdfDataUri.split(',')[1];
  const pdfBuffer = Buffer.from(base64, 'base64');

  const supabase = createAdminClient();
  const fileName = `${student.roll_no.replace(/\//g, '-')}-${student.qr_token}.pdf`;
  const filePath = `passes/${fileName}`;

  const { error } = await supabase.storage
    .from('passes')
    .upload(filePath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (error) throw new Error(`PDF upload failed: ${error.message}`);

  // Create 24-hour signed URL for email
  const { data: signedData, error: signError } = await supabase.storage
    .from('passes')
    .createSignedUrl(filePath, 60 * 60 * 24); // 24 hours

  if (signError || !signedData?.signedUrl) {
    throw new Error(`Failed to generate signed URL: ${signError?.message}`);
  }

  return {
    signedUrl: signedData.signedUrl,
    filePath,
  };
}

/**
 * Get or regenerate a 1-hour signed URL for an existing pass, utilizing DB caching.
 */
export async function getPassDownloadSignedUrl(rollNo: string): Promise<string | null> {
  const supabase = createAdminClient();

  const { data: pass } = await supabase
    .from('approved_passes')
    .select('id, roll_no, qr_token, pass_pdf_cached_url, pass_pdf_cache_expires, pass_status')
    .eq('roll_no', rollNo)
    .maybeSingle();

  if (!pass || pass.pass_status === 'revoked') return null;

  const now = new Date();

  // If cache is valid (expires in the future with at least 2 minutes buffer)
  if (
    pass.pass_pdf_cached_url &&
    pass.pass_pdf_cache_expires &&
    new Date(pass.pass_pdf_cache_expires).getTime() > now.getTime() + 120000
  ) {
    return pass.pass_pdf_cached_url;
  }

  // Generate new 1-hour signed URL
  const fileName = `${pass.roll_no.replace(/\//g, '-')}-${pass.qr_token}.pdf`;
  const filePath = `passes/${fileName}`;

  const { data: signedData, error } = await supabase.storage
    .from('passes')
    .createSignedUrl(filePath, 60 * 60); // 1 hour

  if (error || !signedData?.signedUrl) {
    console.error('Failed to create signed URL:', error);
    return null;
  }

  const cacheExpires = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  // Update DB cache
  await supabase
    .from('approved_passes')
    .update({
      pass_pdf_cached_url: signedData.signedUrl,
      pass_pdf_cache_expires: cacheExpires,
    })
    .eq('id', pass.id);

  return signedData.signedUrl;
}
