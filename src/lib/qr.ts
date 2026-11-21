import QRCode from 'qrcode';

/** Pickup QR code as a PNG data URI (the QR contains the secret pickup token). */
export async function qrPngDataUri(token: string): Promise<string> {
  return QRCode.toDataURL(token, { errorCorrectionLevel: 'M', margin: 2, width: 440, color: { dark: '#000000', light: '#ffffff' } });
}
