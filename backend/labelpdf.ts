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

export interface BoxLabelPayload {
  type: 'box';
  id: string;
  url: string;
  location: string | null;
  description: string | null;
  quantity: number | null;
  itemCount?: number | null;
}

export interface BoxLabelOptions {
  boxData: BoxLabelPayload;
  outPath: string;
}

export async function pdfForBox({ boxData, outPath }: BoxLabelOptions): Promise<string> {
  if (!PDFDocument) throw new Error('pdfkit module not available');
  try {
    const doc = new PDFDocument({ size: 'A5', margin: 36 });
    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);

    const qrContent = JSON.stringify(boxData);
    const qr = await makeQrPngBuffer(qrContent);

    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const qrSize = Math.min(220, contentWidth * 0.4);
    const textWidth = Math.max(contentWidth - qrSize - 24, contentWidth * 0.5);
    const textX = doc.page.margins.left;
    const textY = doc.page.margins.top;
    const qrX = doc.page.margins.left + textWidth + 24;
    const qrY = doc.page.margins.top;

    doc
      .font('Helvetica-Bold')
      .fontSize(26)
      .text(`Box ${boxData.id}`, textX, textY, { width: textWidth });

    doc
      .moveDown(0.3)
      .font('Helvetica')
      .fontSize(14)
      .fillColor('#000')
      .text(`Location: ${boxData.location ?? '—'}`, { width: textWidth });

    const description = boxData.description?.trim() || '—';
    doc
      .moveDown(0.3)
      .fontSize(12)
      .fillColor('#333')
      .text(`Description: ${description}`, { width: textWidth });

    const quantityLabel =
      typeof boxData.quantity === 'number' && Number.isFinite(boxData.quantity)
        ? boxData.quantity
        : '—';
    doc
      .moveDown(0.3)
      .fontSize(12)
      .fillColor('#000')
      .text(`Quantity: ${quantityLabel}`, { width: textWidth });

    if (typeof boxData.itemCount === 'number' && Number.isFinite(boxData.itemCount)) {
      doc
        .moveDown(0.2)
        .fontSize(11)
        .fillColor('#000')
        .text(`Items: ${boxData.itemCount}`, { width: textWidth });
    }

    doc.image(qr, qrX, qrY, { fit: [qrSize, qrSize] });

    doc
      .moveDown(0.8)
      .fontSize(10)
      .fillColor('#666')
      .text(boxData.url, textX, doc.page.height - doc.page.margins.bottom - 40, {
        width: contentWidth
      })
      .fillColor('#000');
    doc.end();

    await new Promise<void>((res) => stream.on('finish', () => res()));
    return outPath;
  } catch (err) {
    console.error('Failed to create box label PDF', err);
    throw err;
  }
}

export interface ItemLabelPayload {
  type: 'item';
  id: string;
  url: string;
  materialNumber: string | null;
  boxId: string | null;
  location: string | null;
  description: string | null;
  quantity: number | null;
}

export interface ItemLabelOptions {
  itemData: ItemLabelPayload;
  outPath: string;
}

export async function pdfForItem({ itemData, outPath }: ItemLabelOptions): Promise<string> {
  if (!PDFDocument) throw new Error('pdfkit module not available');
  try {
    const doc = new PDFDocument({ size: 'A5', margin: 36 });
    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);

    const qrContent = JSON.stringify(itemData);
    const qr = await makeQrPngBuffer(qrContent);

    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const qrSize = Math.min(220, contentWidth * 0.4);
    const textWidth = Math.max(contentWidth - qrSize - 24, contentWidth * 0.5);
    const textX = doc.page.margins.left;
    const textY = doc.page.margins.top;
    const qrX = doc.page.margins.left + textWidth + 24;
    const qrY = doc.page.margins.top;

    doc
      .font('Helvetica-Bold')
      .fontSize(24)
      .text(`Material: ${itemData.materialNumber ?? '—'}`, textX, textY, { width: textWidth });

    doc
      .moveDown(0.3)
      .font('Helvetica')
      .fontSize(13)
      .fillColor('#000')
      .text(`Item ID: ${itemData.id}`, { width: textWidth });

    if (itemData.boxId) {
      doc
        .moveDown(0.2)
        .fontSize(12)
        .fillColor('#000')
        .text(`Box: ${itemData.boxId}`, { width: textWidth });
    }

    doc
      .moveDown(0.2)
      .fontSize(12)
      .fillColor('#000')
      .text(`Location: ${itemData.location ?? '—'}`, { width: textWidth });

    const description = itemData.description?.trim() || '—';
    doc
      .moveDown(0.3)
      .fontSize(12)
      .fillColor('#333')
      .text(`Description: ${description}`, { width: textWidth });

    const quantityLabel =
      typeof itemData.quantity === 'number' && Number.isFinite(itemData.quantity)
        ? itemData.quantity
        : '—';
    doc
      .moveDown(0.3)
      .fontSize(12)
      .fillColor('#000')
      .text(`Quantity: ${quantityLabel}`, { width: textWidth });

    doc.image(qr, qrX, qrY, { fit: [qrSize, qrSize] });

    doc
      .moveDown(0.8)
      .fontSize(10)
      .fillColor('#666')
      .text(itemData.url, textX, doc.page.height - doc.page.margins.bottom - 40, {
        width: contentWidth
      })
      .fillColor('#000');
    doc.end();

    await new Promise<void>((res) => stream.on('finish', () => res()));
    return outPath;
  } catch (err) {
    console.error('Failed to create item label PDF', err);
    throw err;
  }
}

