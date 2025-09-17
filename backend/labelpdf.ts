import fs from 'fs';

let PDFDocument: any;
let QRCode: any;
try {
  PDFDocument = require('pdfkit');
  QRCode = require('qrcode');
} catch (err) {
  console.error('PDF generation unavailable', err);
}

async function makeQrPngBuffer(text: string): Promise<Buffer> {
  if (!QRCode) throw new Error('qrcode module not available');
  return QRCode.toBuffer(text, { type: 'png', margin: 0, scale: 6 });
}

export interface BoxLabelOptions {
  boxId: string;
  location?: string;
  url: string;
  outPath: string;
}

export async function pdfForBox({ boxId, location, url, outPath }: BoxLabelOptions): Promise<string> {
  if (!PDFDocument) throw new Error('pdfkit module not available');
  try {
    const doc = new PDFDocument({ size: 'A7', margin: 12 }); // compact label size
    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);

    doc.fontSize(18).text(`BOX ${boxId}`, { continued: false });
    if (location)
      doc
        .fontSize(12)
        .fillColor('#444')
        .text(`Loc: ${location}`)
        .fillColor('#000');

    const qr = await makeQrPngBuffer(url);
    doc.image(qr, { fit: [180, 180], align: 'left' });

    doc.fontSize(8).fillColor('#444').text(url, { width: 260 });
    doc.end();

    await new Promise<void>((res) => stream.on('finish', () => res()));
    return outPath;
  } catch (err) {
    console.error('Failed to create box label PDF', err);
    throw err;
  }
}

export interface ItemLabelOptions {
  materialNumber?: string;
  itemUUID?: string;
  url: string;
  outPath: string;
}

export async function pdfForItem({ materialNumber, itemUUID, url, outPath }: ItemLabelOptions): Promise<string> {
  if (!PDFDocument) throw new Error('pdfkit module not available');
  try {
    const doc = new PDFDocument({ size: 'A7', margin: 12 });
    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);

    doc.fontSize(16).text(`MatNr: ${materialNumber || '-'}`);
    doc
      .fontSize(12)
      .fillColor('#444')
      .text(`UID: ${(itemUUID || '').slice(-6).toUpperCase()}`)
      .fillColor('#000');

    const qr = await makeQrPngBuffer(url);
    doc.image(qr, { fit: [180, 180], align: 'left' });

    doc.fontSize(8).fillColor('#444').text(url, { width: 260 });
    doc.end();

    await new Promise<void>((res) => stream.on('finish', () => res()));
    return outPath;
  } catch (err) {
    console.error('Failed to create item label PDF', err);
    throw err;
  }
}

