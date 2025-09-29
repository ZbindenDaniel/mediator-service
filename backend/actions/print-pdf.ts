import type { BoxLabelPayload, ItemLabelPayload } from '../../models';

const MM_TO_PT = 72 / 25.4;
const DEFAULT_QR_MARGIN = 4;
const FONT_NAME = '/F1';
const FONT_OBJECT_ID = 5;

interface PdfOptions {
  logger?: Pick<typeof console, 'error' | 'warn'>;
}

// TODO: Support dynamic font metrics instead of the rough approximation in wrapText.
function mmToPoints(mm: number): number {
  return mm * MM_TO_PT;
}

function escapePdfText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\r?\n/g, '\\n');
}

function wrapText(paragraphs: string[], fontSize: number, maxWidth: number): string[] {
  const maxCharsPerLine = Math.max(10, Math.floor(maxWidth / (fontSize * 0.55)));
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    if (!paragraph) {
      lines.push('');
      continue;
    }
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }

    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > maxCharsPerLine && current) {
        lines.push(current);
        current = word;
      } else if (candidate.length > maxCharsPerLine) {
        // break very long words if necessary
        const chunks = word.match(new RegExp(`.{1,${maxCharsPerLine}}`, 'g')) ?? [word];
        for (let i = 0; i < chunks.length; i += 1) {
          if (i === 0 && current) {
            lines.push(current);
          }
          lines.push(chunks[i]!);
        }
        current = '';
      } else {
        current = candidate;
      }
    }
    if (current) {
      lines.push(current);
    }
  }

  return lines;
}

function buildPdf(contentStream: string, pageWidth: number, pageHeight: number): Buffer {
  const objects: string[] = [];
  objects[1] = '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n';
  objects[2] = '2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj\n';
  objects[3] = `3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)}] /Contents 4 0 R /Resources << /Font << ${FONT_NAME} ${FONT_OBJECT_ID} 0 R >> >> >> endobj\n`;
  const contentLength = Buffer.byteLength(contentStream, 'utf8');
  objects[4] = `4 0 obj << /Length ${contentLength} >> stream\n${contentStream}\nendstream\nendobj\n`;
  objects[FONT_OBJECT_ID] = `${FONT_OBJECT_ID} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n`;

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  let position = pdf.length;

  for (let i = 1; i < objects.length; i += 1) {
    if (!objects[i]) continue;
    offsets[i] = position;
    pdf += objects[i]!;
    position = pdf.length;
  }

  const xrefStart = position;
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < objects.length; i += 1) {
    if (!objects[i]) continue;
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, 'utf8');
}

function appendText(
  parts: string[],
  text: string,
  fontSize: number,
  x: number,
  y: number,
  options?: { grey?: number }
): void {
  if (options?.grey !== undefined) {
    parts.push(`${options.grey.toFixed(2)} g`);
  }
  parts.push(`BT ${FONT_NAME} ${fontSize.toFixed(2)} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${escapePdfText(text)}) Tj ET`);
  if (options?.grey !== undefined) {
    parts.push('0 g');
  }
}

function appendNotes(parts: string[], text: string | null, fontSize: number, x: number, startY: number, maxWidth: number): number {
  if (!text) {
    appendText(parts, 'Keine Notizen hinterlegt.', fontSize, x, startY, { grey: 0.45 });
    return startY - fontSize - fontSize * 0.4;
  }
  const paragraphs = text.split(/\r?\n/);
  const lines = wrapText(paragraphs, fontSize, maxWidth);
  let cursorY = startY;
  for (const line of lines) {
    appendText(parts, line, fontSize, x, cursorY, { grey: 0.1 });
    cursorY -= fontSize + fontSize * 0.35;
  }
  return cursorY;
}

function appendQr(
  parts: string[],
  modules: boolean[][] | null,
  margin: number,
  x: number,
  y: number,
  size: number,
  options?: PdfOptions
): void {
  const logger = options?.logger ?? console;
  if (!modules || modules.length === 0) {
    logger.warn('QR data unavailable for PDF rendering');
    return;
  }
  const quietZone = Number.isFinite(margin) ? Math.max(0, Math.floor(margin)) : DEFAULT_QR_MARGIN;
  const totalModules = modules.length + quietZone * 2;
  if (totalModules <= 0) {
    logger.warn('Invalid QR module size for PDF rendering');
    return;
  }
  const moduleSize = size / totalModules;
  const startX = x;
  const startY = y;

  parts.push('1 g');
  parts.push(`${startX.toFixed(2)} ${startY.toFixed(2)} ${size.toFixed(2)} ${size.toFixed(2)} re f`);
  parts.push('0 g');

  for (let row = 0; row < modules.length; row += 1) {
    const rowData = modules[row];
    if (!Array.isArray(rowData)) continue;
    for (let col = 0; col < rowData.length; col += 1) {
      if (!rowData[col]) continue;
      const rectX = startX + (col + quietZone) * moduleSize;
      const rectY = startY + (totalModules - (row + quietZone + 1)) * moduleSize;
      parts.push(`${rectX.toFixed(2)} ${rectY.toFixed(2)} ${moduleSize.toFixed(2)} ${moduleSize.toFixed(2)} re f`);
    }
  }
}

export function renderBoxLabelPdf(payload: BoxLabelPayload, options?: PdfOptions): Buffer {
  const pageWidth = mmToPoints(148);
  const pageHeight = mmToPoints(105);
  const margin = mmToPoints(12);
  const qrSize = mmToPoints(46);
  const qrX = pageWidth - margin - qrSize;
  const qrY = pageHeight - margin - qrSize;
  const textWidth = qrX - margin - mmToPoints(4);

  const parts: string[] = [];
  let cursorY = pageHeight - margin - 2;

  appendQr(parts, payload.qrModules, payload.qrMargin, qrX, qrY, qrSize, options);

  cursorY -= 16;
  appendText(parts, `Behälter ${payload.id}`, 22, margin, cursorY);

  cursorY -= 24;
  if (payload.location) {
    appendText(parts, payload.location, 12, margin, cursorY, { grey: 0.45 });
    cursorY -= 20;
  }

  if (payload.placedBy || payload.placedAt) {
    if (payload.placedBy) {
      appendText(parts, `Eingelagert von: ${payload.placedBy}`, 11, margin, cursorY, { grey: 0.25 });
      cursorY -= 18;
    }
    if (payload.placedAt) {
      appendText(parts, `Eingelagert am: ${payload.placedAt}`, 11, margin, cursorY, { grey: 0.25 });
      cursorY -= 18;
    }
  }

  cursorY -= 6;
  appendText(parts, 'Notizen', 11, margin, cursorY, { grey: 0.4 });
  cursorY -= 18;
  cursorY = appendNotes(parts, payload.notes, 10, margin, cursorY, textWidth);

  const stream = parts.join('\n');
  return buildPdf(stream, pageWidth, pageHeight);
}

export function renderItemLabelPdf(payload: ItemLabelPayload, options?: PdfOptions): Buffer {
  const pageWidth = mmToPoints(148);
  const pageHeight = mmToPoints(105);
  const margin = mmToPoints(12);
  const qrSize = mmToPoints(46);
  const qrX = pageWidth - margin - qrSize;
  const qrY = pageHeight - margin - qrSize;
  const textWidth = qrX - margin - mmToPoints(4);

  const parts: string[] = [];
  let cursorY = pageHeight - margin - 2;

  appendQr(parts, payload.qrModules, payload.qrMargin, qrX, qrY, qrSize, options);

  cursorY -= 16;
  appendText(parts, `Inventar ${payload.id}`, 20, margin, cursorY);
  cursorY -= 24;

  if (payload.articleNumber) {
    appendText(parts, `Artikelnummer: ${payload.articleNumber}`, 12, margin, cursorY, { grey: 0.3 });
    cursorY -= 20;
  }

  if (payload.boxId) {
    appendText(parts, `Behälter: ${payload.boxId}`, 12, margin, cursorY, { grey: 0.3 });
    cursorY -= 20;
  }

  if (payload.location) {
    appendText(parts, `Standort: ${payload.location}`, 12, margin, cursorY, { grey: 0.3 });
    cursorY -= 20;
  }

  cursorY -= 10;
  appendText(parts, 'Hinweise', 11, margin, cursorY, { grey: 0.4 });
  cursorY -= 18;
  cursorY = appendNotes(parts, 'Bitte auf Vollständigkeit prüfen.', 10, margin, cursorY, textWidth);

  const stream = parts.join('\n');
  return buildPdf(stream, pageWidth, pageHeight);
}
