import fs from 'fs';

let QRCode: any;
try {
  QRCode = require('qrcode');
} catch (err) {
  console.error('QR generation unavailable', err);
}

// TODO(agent): Keep size-based label templates in sync with frontend print previews.
// TODO(agent): Outline HTML label export assumptions for postmortems.
// TODO(agent): Revisit single-template assumption if printer hardware changes.
// TODO(agent): Reassess additional label sizes once 62x100-only telemetry stabilises.

const NUMBER_FORMAT = new Intl.NumberFormat('de-DE');
const DATE_FORMAT = new Intl.DateTimeFormat('de-DE');

export type LabelTemplate = '62x100';

// TODO(agent): Validate physical print sizing for all label templates.
const TEMPLATE_DIMENSIONS: Record<LabelTemplate, { width: number; height: number }> = {
  '62x100': { width: 62, height: 100 }
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

function displayValue(value: string | null | undefined): string {
  if (typeof value !== 'string') return '—';
  const trimmed = value.trim();
  return trimmed || '—';
}

async function makeQrDataUrl(text: string): Promise<string> {
  if (!QRCode) throw new Error('qrcode module not available');
  return QRCode.toDataURL(text, { type: 'image/png', margin: 0, scale: 6 });
}

function renderMetaRow(label: string, value: string): string {
  return `<div class="meta-row"><span class="meta-label">${escapeHtml(label)}</span><span class="meta-value">${escapeHtml(value)}</span></div>`;
}

function buildLabelHtml(options: {
  title: string;
  subtitle?: string | null;
  description?: string | null;
  qrDataUrl: string;
  metaRows: string[];
  template: LabelTemplate;
  badge: string;
  footerNote?: string;
}): string {
  const { title, subtitle, description, qrDataUrl, metaRows, template, badge, footerNote } = options;
  const { width, height } = TEMPLATE_DIMENSIONS[template];
  const safeSubtitle = subtitle ? displayValue(subtitle) : '';
  const descriptionText = displayValue(description || '');
  const footer = footerNote ? `<div class="footer">${escapeHtml(footerNote)}</div>` : '';
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    const error = new Error('Invalid template dimensions');
    console.error('[label] Invalid template dimensions', { template, width, height, error });
    throw error;
  }
  const pageSize = `${width}mm ${height}mm`;

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>Label ${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; }
    @page {
      size: ${pageSize};
      margin: 0;
    }
    @media print {
      body { margin: 0; }
      .label-shell {
        width: ${width}mm;
        min-height: ${height}mm;
      }
    }
    body {
      font-family: 'Helvetica', 'Arial', sans-serif;
      background: #f5f7fb;
      padding: 16px;
      margin: 0;
    }
    .label-shell {
      width: ${width}mm;
      min-height: ${height}mm;
      background: #ffffff;
      border: 1px solid #d8dee9;
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(17, 24, 39, 0.12);
      padding: 18px;
      display: grid;
      grid-template-columns: 1fr 190px;
      grid-template-rows: auto auto 1fr auto;
      gap: 12px;
    }
    .label-heading {
      grid-column: 1 / 2;
    }
    .badge {
      display: inline-block;
      background: #0f62fe;
      color: #f9fbff;
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.3px;
      text-transform: uppercase;
    }
    .title {
      font-size: 20px;
      font-weight: 700;
      color: #102a43;
      margin: 6px 0 2px 0;
      word-break: break-word;
    }
    .subtitle {
      font-size: 13px;
      color: #52606d;
      margin: 0;
    }
    .qr {
      grid-row: 1 / span 3;
      grid-column: 2 / 3;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f0f4ff;
      border-radius: 10px;
      padding: 10px;
      border: 1px dashed #cbd2d9;
    }
    .qr img { width: 160px; height: 160px; object-fit: contain; }
    .meta {
      grid-column: 1 / 2;
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 4px;
    }
    .meta-row {
      display: grid;
      grid-template-columns: 160px 1fr;
      gap: 10px;
      font-size: 13px;
      color: #243b53;
    }
    .meta-label { font-weight: 600; color: #334e68; }
    .meta-value { color: #102a43; word-break: break-word; }
    .description-block {
      grid-column: 1 / 3;
      background: #f8fafc;
      border-radius: 10px;
      border: 1px solid #e4e7eb;
      padding: 12px 14px;
    }
    .description-title {
      font-size: 13px;
      font-weight: 700;
      color: #243b53;
      margin: 0 0 6px 0;
    }
    .description-text {
      font-size: 13px;
      color: #102a43;
      margin: 0;
      line-height: 1.4;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .footer {
      grid-column: 1 / 3;
      font-size: 11px;
      color: #52606d;
      margin-top: 4px;
      text-align: right;
    }
  </style>
</head>
<body>
  <div class="label-shell">
    <div class="label-heading">
      <span class="badge">${escapeHtml(badge)}</span>
      <div class="title">${escapeHtml(title)}</div>
      ${safeSubtitle ? `<p class="subtitle">${escapeHtml(safeSubtitle)}</p>` : ''}
    </div>
    <div class="qr">
      <img src="${qrDataUrl}" alt="QR code for ${escapeHtml(title)}" />
    </div>
    <div class="meta">
      ${metaRows.join('')}
    </div>
    <div class="description-block">
      <p class="description-title">Beschreibung</p>
      <p class="description-text">${escapeHtml(descriptionText)}</p>
    </div>
    ${footer}
  </div>
</body>
</html>`;
}

async function writeHtmlFile(outPath: string, html: string, context: string): Promise<void> {
  return await new Promise((resolve, reject) => {
    fs.writeFile(outPath, html, 'utf8', (err) => {
      if (err) {
        console.error(`[label] Failed to persist ${context} HTML`, { outPath, error: err });
        reject(err);
        return;
      }
      resolve(undefined);
    });
  });
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

export async function htmlForBox({ boxData, outPath }: BoxLabelOptions): Promise<string> {
  const template: LabelTemplate = '62x100';
  const labelText = (boxData.labelText || boxData.id || '').trim() || boxData.id;
  const qrPayload = { ...boxData, template, labelText, type: 'box' } as Record<string, unknown>;

  try {
    const qrDataUrl = await makeQrDataUrl(JSON.stringify(qrPayload));
    const metaRows = [
      renderMetaRow('Standort', displayValue(boxData.standortLabel || boxData.location)),
      renderMetaRow('Anzahl gesamt', formatNumber(boxData.quantity)),
      renderMetaRow('Artikelpositionen', formatNumber(boxData.itemCount)),
      renderMetaRow('Label-Template', template)
    ];

    const html = buildLabelHtml({
      title: labelText,
      subtitle: boxData.location || boxData.standortLabel,
      description: boxData.description,
      qrDataUrl,
      metaRows,
      template,
      badge: 'Box'
    });

    await writeHtmlFile(outPath, html, 'box label');
    console.log('[label] Box HTML saved', { outPath, template });
    return outPath;
  } catch (err) {
    console.error('Failed to create box label HTML', err);
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

export async function htmlForItem({ itemData, outPath }: ItemLabelOptions): Promise<string> {
  const template: LabelTemplate = '62x100';
  const labelText = (itemData.labelText || itemData.materialNumber || itemData.id || '').trim() || itemData.id;
  const qrPayload = { ...itemData, template, labelText, type: 'item' } as Record<string, unknown>;

  try {
    const qrDataUrl = await makeQrDataUrl(JSON.stringify(qrPayload));
    const metaRows = [
      renderMetaRow('Materialnummer', displayValue(itemData.materialNumber)),
      renderMetaRow('Box', displayValue(itemData.boxId)),
      renderMetaRow('Standort', displayValue(itemData.location)),
      renderMetaRow('Menge', formatNumber(itemData.quantity)),
      renderMetaRow('Hinzugefügt', formatDate(itemData.addedAt)),
      renderMetaRow('Aktualisiert', formatDate(itemData.updatedAt)),
      renderMetaRow('Label-Template', template)
    ];

    const html = buildLabelHtml({
      title: labelText,
      subtitle: itemData.location,
      description: itemData.description,
      qrDataUrl,
      metaRows,
      template,
      badge: 'Artikel',
      footerNote: itemData.boxId ? `Box-ID: ${itemData.boxId}` : undefined
    });

    await writeHtmlFile(outPath, html, 'item label');
    console.log('[label] Item HTML saved', { outPath, template });
    return outPath;
  } catch (err) {
    console.error('Failed to create item label HTML', err);
    throw err;
  }
}
