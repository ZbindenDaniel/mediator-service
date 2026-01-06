import { renderLabelTemplate, type LabelHtmlTemplate } from './labelTemplateLoader';

// TODO(agent): Keep injected label payloads minimal and aligned with printer-specific templates.

export type LabelTemplate = LabelHtmlTemplate;
const ACTIVE_TEMPLATE: LabelTemplate = '62x100';

let QRCode: any;
try {
  QRCode = require('qrcode');
} catch (err) {
  console.error('[label-html] QR generation unavailable', err);
}

function resolveBoxLabelText(boxData: BoxLabelPayload): string {
  const fallbacks = [boxData.labelText, boxData.id];
  for (const candidate of fallbacks) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return boxData.id;
}

function resolveItemLabelText(itemData: ItemLabelPayload): string {
  const fallbacks = [itemData.labelText, itemData.materialNumber, itemData.id];
  for (const candidate of fallbacks) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return itemData.id;
}

async function makeQrDataUrl(payload: Record<string, unknown>, logger: Console): Promise<string> {
  if (!QRCode) {
    const err = new Error('qrcode module not available');
    logger.error('[label-html] QR generation unavailable', err);
    throw err;
  }
  try {
    const serialized = JSON.stringify(payload);
    return await QRCode.toDataURL(serialized, { type: 'image/png', margin: 0, scale: 6 });
  } catch (err) {
    logger.error('[label-html] Failed to generate QR data URL', err);
    throw err;
  }
}

async function render62x100Label(
  payload: Record<string, unknown>,
  outPath: string,
  logger: Console
): Promise<string> {
  const qrPayload = { ...payload, template: ACTIVE_TEMPLATE };
  const qrDataUri = await makeQrDataUrl(qrPayload, logger);

  try {
    await renderLabelTemplate({
      template: ACTIVE_TEMPLATE,
      payload: { ...qrPayload, qrPayload, qrDataUri },
      outPath,
      logger
    });
    logger.info('[label-html] Label HTML saved', { outPath, template: ACTIVE_TEMPLATE, type: payload.type });
    return outPath;
  } catch (err) {
    logger.error('[label-html] Failed to render label template', { outPath, template: ACTIVE_TEMPLATE, error: err });
    throw err;
  }
}

export interface BoxLabelPayload {
  type: 'box';
  id: string;
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
  logger?: Console;
}

export async function htmlForBox({ boxData, outPath, logger = console }: BoxLabelOptions): Promise<string> {
  const labelText = resolveBoxLabelText(boxData);
  return render62x100Label({ ...boxData, labelText, type: 'box' }, outPath, logger);
}

export interface ItemLabelPayload {
  type: 'item';
  id: string;
  labelText?: string | null;
  materialNumber: string | null;
  boxId?: string | null;
  location?: string | null;
  category: string | null;
  quantity: number | null;
  addedAt: string | null;
  updatedAt: string | null;
}

export interface ItemLabelOptions {
  itemData: ItemLabelPayload;
  outPath: string;
  logger?: Console;
}

export async function htmlForItem({ itemData, outPath, logger = console }: ItemLabelOptions): Promise<string> {
  const labelText = resolveItemLabelText(itemData);
  return render62x100Label({ ...itemData, labelText, type: 'item' }, outPath, logger);
}
