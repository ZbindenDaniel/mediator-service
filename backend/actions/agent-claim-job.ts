import fs from 'fs';
import path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { requireAgentAuth } from '../utils/agent-auth';
import { claimNextLabelJobForAgent, recoverStaleLabelJobs, updateLabelJobStatus, getItem } from '../db';
import type { LabelJob } from '../../models/label-job';
import { htmlForItem } from '../lib/labelHtml';
import type { ItemLabelPayload } from '../lib/labelHtml';
import { ItemEinheit, normalizeItemEinheit } from '../../models';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return await new Promise<Buffer>((resolve, reject) => {
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', (err) => reject(err));
  });
}

function resolveEinheit(value: unknown): ItemEinheit | null {
  try {
    return normalizeItemEinheit(value as string);
  } catch {
    return null;
  }
}

function parseAufLagerValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function toIsoString(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const PREVIEW_DIR = path.join(__dirname, '..', '..', 'data', 'previews');

// Renders item label HTML server-side (where DB access lives) so the print-agent
// can stay credential-free and just fetch the already-rendered file over HTTP
// (docs/PLANNING_multi_instance.md, Component 2 — deviates from the plan's literal
// "reuses print.ts directly" wording because print.ts/cups-client.ts call the
// DB-backed getSetting() internally, which the agent must not have access to).
async function renderItemJobHtml(job: LabelJob): Promise<string> {
  const item = await getItem(job.ItemUUID);
  if (!item) {
    throw new Error('item not found');
  }
  const einheit = resolveEinheit(item.Einheit);
  const parsedAufLager = parseAufLagerValue(item.Auf_Lager);
  const quantity = einheit === ItemEinheit.Menge ? parsedAufLager : 1;

  const itemData: ItemLabelPayload = {
    type: 'item',
    id: item.ItemUUID,
    labelText: item.Artikel_Nummer?.trim() || item.ItemUUID,
    materialNumber: item.Artikel_Nummer?.trim() || null,
    boxId: item.BoxID || null,
    location: item.Location?.trim() || null,
    category: 'Find Me !è',
    quantity: Number.isFinite(quantity) ? quantity : null,
    addedAt: toIsoString(item.Datum_erfasst || item.UpdatedAt),
    updatedAt: toIsoString(item.UpdatedAt)
  };

  const outPath = path.join(
    PREVIEW_DIR,
    `agent-job-${job.ItemUUID}-${Date.now()}.html`.replace(/[^\w.\-]/g, '_')
  );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await htmlForItem({ itemData, outPath });
  const html = fs.readFileSync(outPath, 'utf8');
  fs.unlink(outPath, () => undefined);
  return html;
}

const action = defineHttpAction({
  key: 'agent-claim-job',
  label: 'Agent: claim label job',
  appliesTo: () => false,
  matches: (p, method) => p === '/api/agent/claim-job' && method === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse) {
    if (!requireAgentAuth(req, res)) return;
    let payload: { queues?: unknown };
    try {
      payload = JSON.parse((await readRequestBody(req)).toString('utf8') || '{}');
    } catch {
      return sendJson(res, 400, { error: 'Invalid JSON body' });
    }
    const queues = Array.isArray(payload.queues) ? payload.queues.filter((q) => typeof q === 'string') : [];

    try {
      const staleThreshold = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      await recoverStaleLabelJobs(staleThreshold);
      const job = await claimNextLabelJobForAgent(queues);
      if (!job) {
        return sendJson(res, 200, { job: null });
      }
      try {
        const html = await renderItemJobHtml(job);
        return sendJson(res, 200, { job: { id: job.Id, itemUUID: job.ItemUUID }, html });
      } catch (err) {
        console.error('[agent-claim-job] Failed to render claimed job', job.Id, err);
        await updateLabelJobStatus(job.Id, 'Error', (err as Error).message);
        return sendJson(res, 200, { job: null });
      }
    } catch (err) {
      console.error('[agent-claim-job] Failed to claim job', err);
      return sendJson(res, 500, { error: 'Failed to claim job' });
    }
  },
  view: () => '<div class="card"><p class="muted">Agent job claim API</p></div>'
});

export default action;
