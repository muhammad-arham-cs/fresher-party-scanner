import QRCode from 'qrcode';

/**
 * Generate a QR code from a qr_token string.
 * Returns a base64-encoded PNG data URL.
 */
export async function generateQRCode(qrToken: string): Promise<string> {
  const dataUrl = await QRCode.toDataURL(qrToken, {
    errorCorrectionLevel: 'H',
    type: 'image/png',
    margin: 1,
    width: 300,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });
  return dataUrl;
}

/**
 * Generate a QR code as PNG buffer for embedding in PDFs.
 */
export async function generateQRBuffer(qrToken: string): Promise<Buffer> {
  return QRCode.toBuffer(qrToken, {
    errorCorrectionLevel: 'H',
    type: 'png',
    margin: 1,
    width: 300,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });
}
