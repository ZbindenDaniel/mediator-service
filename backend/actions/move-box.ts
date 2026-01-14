import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';
import { defineHttpAction } from './index';
import { resolveStandortLabel } from '../standort-label';
import { MEDIA_DIR } from '../lib/media';

const BOX_MEDIA_PREFIX = '/media/';
const BOX_MEDIA_FOLDER = 'boxes';
// TODO(agent): Confirm label preservation remains intact for note-only updates after label input removal.

function sanitizeBoxMediaSegment(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function resolveBoxMediaDirectory(boxId: string): { absoluteDir: string; relativeDir: string } {
  const safeId = sanitizeBoxMediaSegment(boxId);
  const relativeDir = path.posix.join(BOX_MEDIA_FOLDER, safeId);
  const absoluteDir = path.join(MEDIA_DIR, relativeDir);
  return { absoluteDir, relativeDir };
}

function removeExistingBoxMedia(boxId: string): void {
  try {
    const { absoluteDir } = resolveBoxMediaDirectory(boxId);
    if (!fs.existsSync(absoluteDir)) {
      return;
    }
    const stat = fs.statSync(absoluteDir);
    if (!stat.isDirectory()) {
      console.warn('Expected box media directory but found different file type', { boxId, absoluteDir });
      return;
    }
    const entries = fs.readdirSync(absoluteDir);
    for (const entry of entries) {
      try {
        fs.unlinkSync(path.join(absoluteDir, entry));
      } catch (unlinkErr) {
        console.error('Failed to remove existing box photo', { boxId, entry, unlinkErr });
      }
    }
    if (fs.readdirSync(absoluteDir).length === 0) {
      try {
        fs.rmdirSync(absoluteDir);
      } catch (removeDirErr) {
        console.warn('Failed to remove empty box media directory', { boxId, removeDirErr });
      }
    }
  } catch (err) {
    console.error('Failed to clean up box media directory', { boxId, err });
  }
}

function persistBoxPhoto(boxId: string, dataUrl: string): string | null {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    console.warn('Rejected box photo payload without valid data URL prefix', { boxId });
    return null;
  }

  const mimeType = match[1];
  const base64Payload = match[2];
  const extension = mimeType.split('/')[1] || 'png';
  const { absoluteDir, relativeDir } = resolveBoxMediaDirectory(boxId);
  const filename = `photo.${extension}`;
  const absolutePath = path.join(absoluteDir, filename);
  const relativePath = path.posix.join(relativeDir, filename);

  try {
    removeExistingBoxMedia(boxId);
    fs.mkdirSync(absoluteDir, { recursive: true });
    const buffer = Buffer.from(base64Payload, 'base64');
    fs.writeFileSync(absolutePath, buffer);
    console.info('Persisted box photo', { boxId, absolutePath });
    return `${BOX_MEDIA_PREFIX}${relativePath}`;
  } catch (err) {
    console.error('Failed to persist box photo', { boxId, err });
    return null;
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action = defineHttpAction({
  key: 'move-box',
  label: 'Move box',
  appliesTo: () => false,
  matches: (path, method) => /^\/api\/boxes\/[^/]+\/move$/.test(path) && method === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const match = req.url?.match(/^\/api\/boxes\/([^/]+)\/move$/);
      const id = match ? decodeURIComponent(match[1]) : '';
      if (!id) return sendJson(res, 400, { error: 'invalid box id' });
      const box = ctx.getBox.get(id);
      if (!box) return sendJson(res, 404, { error: 'box not found' });
      let raw = '';
      for await (const c of req) raw += c;
      let data: any = {};
      try { data = JSON.parse(raw || '{}'); } catch {}
      const actor = (data.actor || '').trim();
      if (!actor) return sendJson(res, 400, { error: 'actor is required' });
      const rawLocationValue = typeof data.location === 'string' ? data.location : '';
      const rawLocationIdValue = typeof data.LocationId === 'string' ? data.LocationId : '';
      const locationInput = rawLocationIdValue || rawLocationValue;
      if (rawLocationIdValue && rawLocationValue && rawLocationIdValue !== rawLocationValue) {
        console.warn('[move-box] Conflicting location inputs provided', {
          boxId: id,
          location: rawLocationValue,
          locationId: rawLocationIdValue
        });
      }
      const locationRaw = locationInput.trim().toUpperCase();
      const hasLocation = locationRaw.length > 0;
      const hasLabelField = Object.prototype.hasOwnProperty.call(data, 'Label') ||
        Object.prototype.hasOwnProperty.call(data, 'label');
      const rawLabelValue = typeof data.Label === 'string' ? data.Label : typeof data.label === 'string' ? data.label : '';
      const normalizedLabel = rawLabelValue.trim();
      const labelFromInput = hasLabelField ? (normalizedLabel ? normalizedLabel : null) : null;
      const existingLocationId = typeof box.LocationId === 'string' && box.LocationId.trim()
        ? box.LocationId.trim().toUpperCase()
        : typeof (box as any).Location === 'string' && (box as any).Location.trim()
          ? (box as any).Location.trim().toUpperCase()
          : '';
      const effectiveLocationId = hasLocation ? locationRaw : existingLocationId;
      const fallbackLabel = typeof box.Label === 'string' && box.Label.trim()
        ? box.Label.trim()
        : typeof (box as any).StandortLabel === 'string' && (box as any).StandortLabel.trim()
          ? (box as any).StandortLabel.trim()
          : null;
      const resolvedLabel = effectiveLocationId ? resolveStandortLabel(effectiveLocationId) : null;
      const nextLabel = hasLabelField
        ? labelFromInput
        : hasLocation
          ? (resolvedLabel ?? fallbackLabel ?? null)
          : (fallbackLabel ?? null);

      if (hasLocation && !nextLabel) {
        console.warn('[move-box] Missing label mapping for location', { boxId: id, locationId: locationRaw });
      }
      const notes = (data.notes ?? '').toString().trim();
      const hasNotesField = Object.prototype.hasOwnProperty.call(data, 'notes');
      const hasPhotoField = Object.prototype.hasOwnProperty.call(data, 'photo');
      const removePhoto = data.removePhoto === true;
      const incomingPhoto = hasPhotoField && typeof data.photo === 'string' ? data.photo : null;
      const hasPhotoMutation = removePhoto || (incomingPhoto !== null && incomingPhoto.length > 0);
      let nextPhotoPath: string | null = box.PhotoPath ?? null;
      let photoChanged = false;

      if (removePhoto) {
        removeExistingBoxMedia(id);
        nextPhotoPath = null;
        photoChanged = true;
      }

      if (incomingPhoto) {
        const persisted = persistBoxPhoto(id, incomingPhoto);
        if (persisted) {
          nextPhotoPath = persisted;
          photoChanged = true;
        } else {
          console.error('Failed to persist incoming box photo payload', { boxId: id });
        }
      }

      if (!hasLocation && (hasNotesField || hasPhotoMutation || hasLabelField)) {
        const noteTxn = ctx.db.transaction(
          (boxId: string, note: string, photoPath: string | null, a: string, labelValue: string | null, locationId: string | null) => {
            ctx.db
              .prepare(`UPDATE boxes SET Label=?, Notes=?, PhotoPath=?, UpdatedAt=datetime('now') WHERE BoxID=?`)
              .run(labelValue, note, photoPath, boxId);
            ctx.logEvent({
              Actor: a,
              EntityType: 'Box',
              EntityId: boxId,
              Event: 'Note',
              Meta: JSON.stringify({ notes: note, photoPath, label: labelValue, locationId })
            });
          }
        );
        try {
          noteTxn(id, notes, nextPhotoPath, actor, nextLabel ?? null, effectiveLocationId || null);
          console.info('[move-box] Processed note/photo update', {
            boxId: id,
            actor,
            photoChanged,
            hasNotesField,
            hasLabelField
          });
        } catch (noteErr) {
          console.error('Note/photo update failed', noteErr);
          throw noteErr;
        }
        sendJson(res, 200, { ok: true, photoPath: nextPhotoPath });
        return;
      }

      if (!hasLocation && !effectiveLocationId) {
        return sendJson(res, 400, { error: 'location is required' });
      }

      const txn = ctx.db.transaction(
        (boxId: string, loc: string, note: string, photoPath: string | null, a: string, resolvedLabel: string | null) => {
          ctx.db
            .prepare(
              `UPDATE boxes SET LocationId=?, Label=?, Notes=?, PhotoPath=?, PlacedBy=?, PlacedAt=datetime('now'), UpdatedAt=datetime('now') WHERE BoxID=?`
            )
            .run(loc, resolvedLabel, note, photoPath, a, boxId);
          ctx.logEvent({
            Actor: a,
            EntityType: 'Box',
            EntityId: boxId,
            Event: 'Moved',
            Meta: JSON.stringify({ locationId: loc, notes: note, label: resolvedLabel, photoPath })
          });
        }
      );
      txn(id, hasLocation ? locationRaw : effectiveLocationId, notes, nextPhotoPath, actor, nextLabel ?? null);
      console.info('[move-box] Processed move update', {
        boxId: id,
        actor,
        location: hasLocation ? locationRaw : effectiveLocationId,
        photoChanged,
        notesChanged: hasNotesField,
        hasLabelField
      });
      sendJson(res, 200, { ok: true, photoPath: nextPhotoPath });
    } catch (err) {
      console.error('Move box failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Move box API</p></div>'
});

export default action;
