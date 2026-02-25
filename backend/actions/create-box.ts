import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
// TODO(agent): Align shelf label text with printed shelf A4 template once the layout is finalized.
import type { CreateBoxPayload, CreateShelfPayload } from '../../models';

// TODO(agent): Verify shelf ID padding once the label template specification is clarified.
// TODO(agent): Remove category-based shelf label fallback assumptions from any remaining admin tooling.
// TODO(agent): Standardize shelf label/note normalization rules with frontend validation.

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readRequestBody(req: IncomingMessage): Promise<string> {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
  }
  return raw;
}

function normalizeShelfField(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    if (!/^[A-Za-z0-9]+$/.test(trimmed)) {
      return null;
    }
    return trimmed.toUpperCase();
  }

  return null;
}

function isMissingShelfValue(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

const action = defineHttpAction({
  key: 'create-box',
  label: 'Create box',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/boxes' && method === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      let raw = '';
      try {
        raw = await readRequestBody(req);
      } catch (err) {
        console.error('[create-box] Failed to read request body', err);
        return sendJson(res, 400, { error: 'Invalid request body' });
      }

      if (!raw) {
        console.error('[create-box] Missing request body');
        return sendJson(res, 400, { error: 'Request body required' });
      }

      let data: CreateBoxPayload;
      try {
        data = JSON.parse(raw) as CreateBoxPayload;
      } catch (err) {
        console.error('[create-box] Failed to parse JSON body', err);
        return sendJson(res, 400, { error: 'Invalid JSON body' });
      }

      const actor = (data.actor || '').trim();
      if (!actor) {
        console.error('[create-box] Missing actor');
        return sendJson(res, 400, { error: 'actor is required' });
      }

      const normalizedType = typeof data.type === 'string' ? data.type.trim().toLowerCase() : '';
      if (normalizedType === 'shelf') {
        const shelfPayload = data as CreateShelfPayload;
        const missingFields: string[] = [];
        const invalidFields: string[] = [];

        const rawLocation = shelfPayload.location;
        const location = normalizeShelfField(rawLocation);
        if (isMissingShelfValue(rawLocation)) {
          missingFields.push('location');
        } else if (!location) {
          invalidFields.push('location');
        }

        const rawFloor = shelfPayload.floor;
        const floor = normalizeShelfField(rawFloor);
        if (isMissingShelfValue(rawFloor)) {
          missingFields.push('floor');
        } else if (!floor) {
          invalidFields.push('floor');
        }

        if (missingFields.length > 0 || invalidFields.length > 0) {
          console.error('[shelf] Invalid shelf payload', {
            missingFields,
            invalidFields,
            provided: { location: rawLocation, floor: rawFloor }
          });
          const messages: string[] = [];
          if (missingFields.length > 0) {
            messages.push(`Missing fields: ${missingFields.join(', ')}`);
          }
          if (invalidFields.length > 0) {
            messages.push(`Invalid fields: ${invalidFields.join(', ')}`);
          }
          return sendJson(res, 400, { error: messages.join('. ') });
        }
        const rawLabel =
          typeof shelfPayload.label === 'string'
            ? shelfPayload.label
            : typeof (shelfPayload as { Label?: string }).Label === 'string'
              ? (shelfPayload as { Label?: string }).Label ?? ''
              : '';
        const normalizedLabel = rawLabel.trim();
        const rawNotes = typeof shelfPayload.notes === 'string' ? shelfPayload.notes : '';
        const normalizedNotes = rawNotes.trim();
        const resolvedShelfLabel = normalizedLabel || `Regal ${location}-${floor}`;
        const resolvedNotes = normalizedNotes ? normalizedNotes : null;
        console.info('[shelf] Resolved shelf label/notes for create', {
          location,
          floor,
          hasCustomLabel: Boolean(normalizedLabel),
          hasNotes: Boolean(normalizedNotes)
        });
        const prefix = `S-${location}-${floor}-`;
        const nowDate = new Date();
        const now = nowDate.toISOString();
        const shelfTxn = ctx.db.transaction(
          (payload: {
            actor: string;
            prefix: string;
            location: string;
            floor: string;
            label: string;
            notes: string | null;
            now: string;
          }) => {
            const maxRow = ctx.getMaxShelfIndex.get({ prefix: payload.prefix }) as
              | { MaxIndex: number | null }
              | undefined;
            let nextIndex = typeof maxRow?.MaxIndex === 'number' && Number.isFinite(maxRow.MaxIndex)
              ? maxRow.MaxIndex + 1
              : 1;
            let attempts = 0;
            const maxAttempts = 25;

            while (attempts < maxAttempts) {
              const candidate = `${payload.prefix}${String(nextIndex).padStart(4, '0')}`;
              const existing = ctx.getBox.get(candidate) as { BoxID?: string } | undefined;
              if (existing?.BoxID) {
                console.warn('[shelf] Shelf ID collision detected, retrying', {
                  candidate,
                  location: payload.location,
                  floor: payload.floor
                });
                attempts += 1;
                nextIndex += 1;
                continue;
              }

              ctx.runUpsertBox({
                BoxID: candidate,
                LocationId: candidate,
                Label: payload.label,
                CreatedAt: payload.now,
                Notes: payload.notes,
                PhotoPath: null,
                PlacedBy: payload.actor,
                PlacedAt: null,
                UpdatedAt: payload.now
              });
              ctx.logEvent({
                Actor: payload.actor,
                EntityType: 'Box',
                EntityId: candidate,
                Event: 'Created',
                Meta: JSON.stringify({
                  type: 'shelf',
                  location: payload.location,
                  floor: payload.floor
                })
              });
              return candidate;
            }

            throw new Error('Failed to allocate shelf ID');
          }
        );

        const shelfId = shelfTxn({
          actor,
          prefix,
          location,
          floor,
          label: resolvedShelfLabel,
          notes: resolvedNotes,
          now
        });
        console.info('[shelf] Created shelf', { boxId: shelfId, location, floor, actor });
        return sendJson(res, 200, { ok: true, id: shelfId });
      }

      const last = ctx.getMaxBoxId.get() as { BoxID: string } | undefined;
      let seq = 0;
      if (last?.BoxID) {
        const m = last.BoxID.match(/^B-\d{6}-(\d+)$/);
        if (m) seq = parseInt(m[1], 10);
      }
      const nowDate = new Date();
      const dd = String(nowDate.getDate()).padStart(2, '0');
      const mm = String(nowDate.getMonth() + 1).padStart(2, '0');
      const yy = String(nowDate.getFullYear()).slice(-2);
      const now = nowDate.toISOString();
      const prefix = `B-${dd}${mm}${yy}-`;
      // TODO(agent): Revisit box ID collision retry caps once contention telemetry is available.
      const maxAttempts = 25;
      const txn = ctx.db.transaction((payload: { actor: string; now: string; prefix: string; startSeq: number }) => {
        let attempts = 0;
        let nextSeq = payload.startSeq;
        let candidate = '';
        try {
          while (attempts < maxAttempts) {
            candidate = `${payload.prefix}${String(nextSeq).padStart(4, '0')}`;
            const existing = ctx.getBox.get(candidate) as { BoxID?: string } | undefined;
            if (existing?.BoxID) {
              console.warn('[create-box] Box ID collision detected, retrying', {
                actor: payload.actor,
                candidate,
                attempt: attempts + 1
              });
              attempts += 1;
              nextSeq += 1;
              continue;
            }

            ctx.runUpsertBox({
              BoxID: candidate,
              // TODO(agent): Capture an initial Label once box creation collects placement context.
              LocationId: null,
              Label: null,
              CreatedAt: payload.now,
              Notes: null,
              PhotoPath: null,
              PlacedBy: payload.actor,
              PlacedAt: null,
              UpdatedAt: payload.now
            });
            ctx.logEvent({
              Actor: payload.actor,
              EntityType: 'Box',
              EntityId: candidate,
              Event: 'Created',
              Meta: null
            });
            console.log('Created box', candidate);
            return candidate;
          }

          throw new Error('Failed to allocate box ID');
        } catch (error) {
          console.error('[create-box] Box ID allocation failed', {
            actor: payload.actor,
            attemptedId: candidate || null,
            error
          });
          throw error;
        }
      });
      const id = txn({ actor, now, prefix, startSeq: seq + 1 });
      sendJson(res, 200, { ok: true, id });
    } catch (err) {
      console.error('[create-box] Create box failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Create box API</p></div>'
});

export default action;
