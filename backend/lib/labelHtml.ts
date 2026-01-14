import { renderLabelTemplate, type LabelHtmlTemplate } from './labelTemplateLoader';

// TODO(agent): Keep injected label payloads minimal and aligned with printer-specific templates.
// TODO(agent): Confirm shelf label payload fields before adding more shelf metadata to QR payloads.

export type LabelTemplate = LabelHtmlTemplate;
// TODO(agent): Validate item label layout before rolling to all printers.
const BOX_TEMPLATE: LabelTemplate = '62x100';
const ITEM_TEMPLATE: LabelTemplate = '29x90';
const SHELF_TEMPLATE: LabelTemplate = 'shelf-a4';

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

async function renderLabel(
  template: LabelTemplate,
  payload: Record<string, unknown>,
  outPath: string,
  logger: Console
): Promise<string> {
  const qrPayload = { ...payload, template };
  const qrDataUri = await makeQrDataUrl(qrPayload, logger);

  try {
    await renderLabelTemplate({
      template,
      payload: { ...qrPayload, qrPayload, qrDataUri },
      outPath,
      logger
    });
    logger.info('[label-html] Label HTML saved', { outPath, template, type: payload.type });
    return outPath;
  } catch (err) {
    logger.error('[label-html] Failed to render label template', { outPath, template, error: err });
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
  return renderLabel(BOX_TEMPLATE, { ...boxData, labelText, type: 'box' }, outPath, logger);
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
  return renderLabel(ITEM_TEMPLATE, { ...itemData, labelText, type: 'item' }, outPath, logger);
}

export interface ShelfLabelPayload {
  type: 'shelf';
  id: string;
  shelfId?: string | null;
  labelText?: string | null;
  category: string | null;
  categoryLabel?: string | null;
  location?: string | null;
  floor?: string | null;
}

export interface ShelfLabelOptions {
  shelfData: ShelfLabelPayload;
  outPath: string;
  logger?: Console;
}

export async function htmlForShelf({ shelfData, outPath, logger = console }: ShelfLabelOptions): Promise<string> {
  return renderLabel(SHELF_TEMPLATE, { ...shelfData, type: 'shelf' }, outPath, logger);
}
