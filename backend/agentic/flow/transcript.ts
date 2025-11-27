import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { resolveMediaPath } from '../../lib/media';
import type { ExtractionLogger } from './item-flow-extraction';

// TODO(agent): Rotate transcript snapshots once multi-run history needs to be preserved for audits.
export const TRANSCRIPT_FILE_NAME = 'agentic-transcript.md';

export interface AgentTranscriptLogger extends Pick<Console, 'error' | 'warn' | 'info'>, ExtractionLogger {}

export interface AgentTranscriptReference {
  filePath: string;
  publicUrl: string;
}

export interface AgentTranscriptWriter extends AgentTranscriptReference {
  appendSection: (heading: string, body: string) => Promise<void>;
}

function stringifyTranscriptPayload(
  payload: unknown,
  logger?: AgentTranscriptLogger | null,
  meta?: { heading?: string; itemId?: string }
): string {
  try {
    return JSON.stringify(payload, null, 2);
  } catch (err) {
    logger?.warn?.({ err, msg: 'failed to serialize transcript payload', heading: meta?.heading, itemId: meta?.itemId });
    return typeof payload === 'string' ? payload : String(payload);
  }
}

export function buildTranscriptBody(
  request: unknown,
  response: string,
  logger?: AgentTranscriptLogger | null,
  meta?: { heading?: string; itemId?: string }
): string {
  const requestBlock = stringifyTranscriptPayload(request, logger, meta);
  const responseBlock = typeof response === 'string' ? response : String(response);
  return [
    '### Request',
    '```json',
    requestBlock,
    '```',
    '',
    '### Response',
    '```',
    responseBlock.trim(),
    '```',
    ''
  ].join('\n');
}

function buildTranscriptReference(itemId: string): AgentTranscriptReference {
  const filePath = resolveMediaPath(itemId, TRANSCRIPT_FILE_NAME);
  const publicUrl = `/media/${encodeURIComponent(itemId)}/${TRANSCRIPT_FILE_NAME}`;
  return { filePath, publicUrl };
}

export function locateTranscript(itemId: string, logger?: AgentTranscriptLogger | null): AgentTranscriptReference | null {
  const reference = buildTranscriptReference(itemId);
  try {
    return fs.existsSync(reference.filePath) ? reference : null;
  } catch (err) {
    logger?.warn?.({ err, msg: 'failed to check transcript presence', itemId, transcriptPath: reference.filePath });
    return null;
  }
}

export async function createTranscriptWriter(
  itemId: string,
  logger?: AgentTranscriptLogger | null
): Promise<AgentTranscriptWriter | null> {
  const reference = buildTranscriptReference(itemId);

  try {
    await fsPromises.mkdir(path.dirname(reference.filePath), { recursive: true });
  } catch (err) {
    logger?.error?.({ err, msg: 'failed to prepare transcript directory', itemId, transcriptPath: reference.filePath });
    return null;
  }

  const headerLines = [
    `# Agent transcript for ${itemId}`,
    '',
    `Last updated at ${new Date().toISOString()}`,
    ''
  ];

  try {
    await fsPromises.writeFile(reference.filePath, headerLines.join('\n'));
  } catch (err) {
    logger?.error?.({ err, msg: 'failed to initialize transcript file', itemId, transcriptPath: reference.filePath });
    return null;
  }

  const appendSection = async (heading: string, body: string): Promise<void> => {
    const sectionLines = [`## ${heading}`, '', body.trimEnd(), '', ''];
    try {
      await fsPromises.appendFile(reference.filePath, sectionLines.join('\n'));
    } catch (err) {
      logger?.warn?.({ err, msg: 'failed to append transcript section', itemId, heading, transcriptPath: reference.filePath });
    }
  };

  return { ...reference, appendSection };
}

export async function appendTranscriptSection(
  writer: AgentTranscriptWriter | null | undefined,
  heading: string,
  request: unknown,
  response: string,
  logger?: AgentTranscriptLogger | null,
  itemId?: string
): Promise<void> {
  if (!writer) {
    return;
  }

  try {
    const body = buildTranscriptBody(request, response, logger, { heading, itemId });
    await writer.appendSection(heading, body);
  } catch (err) {
    logger?.warn?.({ err, msg: 'failed to write transcript section', heading, itemId, transcriptPath: writer.filePath });
  }
}
