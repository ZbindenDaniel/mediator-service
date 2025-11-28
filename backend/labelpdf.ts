import fs from 'fs';

let PDFDocument: any;
let QRCode: any;
try {
  PDFDocument = require('pdfkit');
  QRCode = require('qrcode');
} catch (err) {
  console.error('PDF generation unavailable', err);
}

// TODO(agent): Keep size-based label templates in sync with frontend print previews.

const LABEL_SIZE: [number, number] = [410, 580];
const NUMBER_FORMAT = new Intl.NumberFormat('de-DE');
const DATE_FORMAT = new Intl.DateTimeFormat('de-DE');
// TODO: Surface configurable label styling so branding can be adjusted without code changes.

type LabelTemplate = '23x23';

function mmToPt(mm: number): number {
  return (mm / 25.4) * 72;
}

async function makeQrPngBuffer(text: string): Promise<Buffer> {
  if (!QRCode) throw new Error('qrcode module not available');
  return QRCode.toBuffer(text, { type: 'png', margin: 0, scale: 6 });
}

function formatNumber(value: number | null | undefined): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return NUMBER_FORMAT.format(value);
  }
  return '—';
}

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return typeof value === 'string' ? value : '—';
  }
  return DATE_FORMAT.format(date);
}

export interface BoxLabelPayload {
  type: 'box';
  id: string;
  template?: LabelTemplate;
  labelText?: string | null;
  location?: string | null;
  standortLabel?: string | null;
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
  const template = boxData.template || '23x23';
  const labelText = (boxData.labelText || boxData.id || '').trim() || boxData.id;
  if (template === '23x23') {
    const qrPayload = { ...boxData, template, labelText, type: 'box' } as Record<string, unknown>;
    return pdfFor23x23({ qrPayload, label: labelText, type: 'box' }, outPath);
  }
  try {
    const doc = new PDFDocument({ size: 'A6', margin: 36 });
    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);

    const qrContent = JSON.stringify(boxData);
    const qr = await makeQrPngBuffer(qrContent);

    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const qrSize = Math.min(200, contentWidth * 0.42);
    const textWidth = Math.max(contentWidth - qrSize - 28, contentWidth * 0.55);
    const textX = doc.page.margins.left + 8;
    const textY = doc.page.margins.top + 12;
    const qrX = doc.page.margins.left + textWidth + 20;
    const qrY = doc.page.margins.top + 30;

    const frameX = doc.page.margins.left / 2;
    const frameY = doc.page.margins.top / 2;
    const frameWidth = doc.page.width - frameX * 2;
    const frameHeight = doc.page.height - frameY * 2;

    doc
      .save()
      .roundedRect(textX - 12, textY - 18, textWidth + 24, frameHeight - 48, 12)
      .fill('#ffffff')
      .restore();

    doc
      .save()
      .roundedRect(qrX - 12, qrY - 12, qrSize + 24, qrSize + 24, 12)
      .fill('#ffffff')
      .restore();

    doc
      .moveDown(0.2)
      .font('Helvetica')
      .fontSize(18)
      .fillColor('#1d3557')
      .text(`Box-ID: ${boxData.id}`, { width: contentWidth });

    doc
      .moveDown(1)
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor('#0b1f33')
      .text(`Anzahl gesamt: ${formatNumber(boxData.quantity)}`, { width: textWidth });

    if (typeof boxData.itemCount === 'number' && Number.isFinite(boxData.itemCount)) {
      doc
        .moveDown(0.4)
        .font('Helvetica')
        .fontSize(12)
        .fillColor('#2f3c4f')
        .text(`Artikelpositionen: ${NUMBER_FORMAT.format(boxData.itemCount)}`, { width: textWidth });
    }

    const description = boxData.description?.trim() || '—';
    doc
      .moveDown(3)
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor('#0b1f33')
      .text('Beschreibung', { width: textWidth });

    doc
      .moveDown(0.15)
      .font('Helvetica')
      .fontSize(12)
      .fillColor('#2f3c4f')
      .text(description, { width: contentWidth, lineGap: 2 });



    doc.image(qr, qrX, qrY, { fit: [qrSize, qrSize] });

    doc.end();

    await new Promise<void>((resolve, reject) => {
      stream.on('finish', () => resolve());
      stream.on('error', (err) => reject(err));
    });
    return outPath;
  } catch (err) {
    console.error('Failed to create box label PDF', err);
    throw err;
  }
}

export interface ItemLabelPayload {
  type: 'item';
  id: string;
  template?: LabelTemplate;
  labelText?: string | null;
  materialNumber: string | null;
  boxId?: string | null;
  location?: string | null;
  description: string | null;
  quantity: number | null;
  addedAt: string | null;
  updatedAt: string | null;
}

export interface ItemLabelOptions {
  itemData: ItemLabelPayload;
  outPath: string;
}

interface SquareLabelPayload {
  type: 'box' | 'item';
  label: string;
  qrPayload: Record<string, unknown>;
}

async function pdfFor23x23({ qrPayload, label }: SquareLabelPayload, outPath: string): Promise<string> {
  if (!PDFDocument) throw new Error('pdfkit module not available');
  const labelSize = mmToPt(23);
  const pageSize: [number, number] = [labelSize, labelSize];

  try {
    const doc = new PDFDocument({ size: pageSize, margin: 6 });
    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);

    const qrContent = JSON.stringify(qrPayload);
    const qr = await makeQrPngBuffer(qrContent);

    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const contentHeight = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;
    const frameX = doc.page.margins.left / 2;
    const frameY = doc.page.margins.top / 2;
    const frameWidth = doc.page.width - frameX * 2;
    const frameHeight = doc.page.height - frameY * 2;
    const captionHeight = 12;
    const qrTargetSize = Math.min(contentWidth, contentHeight - captionHeight - 4);
    const qrX = doc.page.margins.left + (contentWidth - qrTargetSize) / 2;
    const qrY = doc.page.margins.top;

    doc
      .save()
      .roundedRect(frameX, frameY, frameWidth, frameHeight, 4)
      .fill('#ffffff')
      .restore();

    doc.image(qr, qrX, qrY, { fit: [qrTargetSize, qrTargetSize] });

    const caption = qrPayload.type === 'box' ? `BoxId ${label}` : `Artikelnummer ${label}`;
    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor('#0b1f33')
      .text(caption, doc.page.margins.left, doc.page.height - doc.page.margins.bottom - captionHeight + 4, {
        width: contentWidth,
        align: 'center'
      });

    doc.end();

    await new Promise<void>((resolve, reject) => {
      stream.on('finish', () => resolve());
      stream.on('error', (err) => reject(err));
    });

    return outPath;
  } catch (err) {
    console.error('Failed to create 23x23 label PDF', err);
    throw err;
  }
}

export async function pdfForItem({ itemData, outPath }: ItemLabelOptions): Promise<string> {
  if (!PDFDocument) throw new Error('pdfkit module not available');
  const template = itemData.template || '23x23';
  const fallbackLabel = itemData.materialNumber || itemData.id;
  const labelText = (itemData.labelText || fallbackLabel || '').trim() || fallbackLabel || itemData.id;
  if (template === '23x23') {
    const qrPayload = { ...itemData, template, labelText, type: 'item' } as Record<string, unknown>;
    return pdfFor23x23({ qrPayload, label: labelText, type: 'item' }, outPath);
  }
  try {
    const doc = new PDFDocument({ size: LABEL_SIZE, margin: 32 });
    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);

    const qrContent = JSON.stringify(itemData);
    const qr = await makeQrPngBuffer(qrContent);

    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const qrSize = Math.min(200, contentWidth * 0.42);
    const textWidth = Math.max(contentWidth - qrSize - 28, contentWidth * 0.55);
    const textX = doc.page.margins.left + 8;
    const textY = doc.page.margins.top + 12;
    const qrX = doc.page.margins.left + textWidth + 20;
    const qrY = doc.page.margins.top + 20;

    const frameX = doc.page.margins.left / 2;
    const frameY = doc.page.margins.top / 2;
    const frameWidth = doc.page.width - frameX * 2;
    const frameHeight = doc.page.height - frameY * 2;

    doc
      .save()
      .roundedRect(textX - 12, textY - 18, textWidth + 24, frameHeight - 48, 12)
      .fill('#ffffff')
      .restore();

    doc
      .save()
      .roundedRect(qrX - 12, qrY - 12, qrSize + 24, qrSize + 24, 12)
      .fill('#ffffff')
      .restore();

    const headline = itemData.description?.trim() || 'Artikel';
    doc
      .font('Helvetica-Bold')
      .fontSize(24)
      .fillColor('#0b1f33')
      .text(headline, textX, textY, { width: textWidth });

    doc
      .moveDown(0.4)
      .font('Helvetica')
      .fontSize(14)
      .fillColor('#1d3557')
      .text('Artikelnummer');

    doc
      .moveDown(0.15)
      .font('Helvetica')
      .fontSize(12)
      .fillColor('#2f3c4f')
      .text(`${itemData.materialNumber?.trim() || '—'}`, { width: textWidth });

    const drawSection = (label: string, value: string, space = 0.7) => {
      doc
        .moveDown(space)
        .font('Helvetica-Bold')
        .fontSize(12)
        .fillColor('#0b1f33')
        .text(label, { width: textWidth });

      doc
        .moveDown(0.15)
        .font('Helvetica')
        .fontSize(12)
        .fillColor('#2f3c4f')
        .text(value || '—', { width: textWidth, lineGap: 2 });
    };

    drawSection('Artikelbeschreibung', headline);
    drawSection('Angelegt am', formatDate(itemData.addedAt));
    drawSection('Geändert am', formatDate(itemData.updatedAt));

    doc
      .moveDown(0.7)
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#0b1f33')
      .text('Anzahl', { width: textWidth });

    doc
      .moveDown(0.2)
      .font('Helvetica')
      .fontSize(16)
      .fillColor('#1d3557')
      .text(formatNumber(itemData.quantity), { width: textWidth });

    doc.image(qr, qrX, qrY, { fit: [qrSize, qrSize] });

    doc.end();

    await new Promise<void>((resolve, reject) => {
      stream.on('finish', () => resolve());
      stream.on('error', (err) => reject(err));
    });
    return outPath;
  } catch (err) {
    console.error('Failed to create item label PDF', err);
    throw err;
  }
}
