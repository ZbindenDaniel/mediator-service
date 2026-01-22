import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { resolveMediaFolder, resolveMediaPath } from '../../lib/media';
import type { ExtractionLogger } from './item-flow-extraction';

// TODO(agent): Rotate transcript snapshots once multi-run history needs to be preserved for audits.
// TODO(agentic-html-transcript): Consider migrating legacy markdown transcripts to HTML when cleanup time permits.
// TODO(agentic-transcript-blocks): Expand structured sections with markdown rendering when safe sanitization exists.
export const TRANSCRIPT_FILE_NAME = 'agentic-transcript.html';
const TRANSCRIPT_SECTION_MARKER = '<!-- transcript-sections -->';
const TRANSCRIPT_FOOTER = '</main>\n</body>\n</html>\n';

export interface AgentTranscriptLogger extends ExtractionLogger {}

export interface AgentTranscriptReference {
  filePath: string;
  publicUrl: string;
}

export interface AgentTranscriptWriter extends AgentTranscriptReference {
  appendSection: (heading: string, body: string) => Promise<void>;
}

export interface TranscriptMessageBlock {
  role?: string;
  content?: string;
  type?: string;
}

export interface TranscriptToolInvocation {
  name?: string;
  input?: unknown;
  output?: unknown;
  status?: string;
}

export interface TranscriptSectionPayload {
  request?: unknown;
  response?: string;
  messages?: TranscriptMessageBlock[];
  toolInvocations?: TranscriptToolInvocation[];
  logLines?: string[];
  errors?: unknown[];
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildTranscriptHeader(itemId: string, updatedAtIso: string): string {
  const updatedDisplay = new Date(updatedAtIso).toLocaleString('de-DE');
  return [
    '<!DOCTYPE html>',
    '<html lang="de">',
    '<head>',
    '  <meta charset="utf-8" />',
    `  <meta name="last-updated" content="${escapeHtml(updatedAtIso)}" />`,
    '  <title>Agentisches Protokoll</title>',
    '  <style>',
    '    :root { color-scheme: only light; }',
    '    body { font-family: Arial, sans-serif; margin: 0; background: #f9fafb; color: #0f172a; }',
    '    main { max-width: 960px; margin: 0 auto; padding: 24px 20px 40px; }',
    '    header { margin-bottom: 24px; }',
    '    .transcript-meta { color: #475569; font-size: 0.95rem; margin: 8px 0 16px; }',
    '    .transcript-section { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; margin-bottom: 16px; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06); }',
    '    .transcript-section h2 { margin: 0 0 8px; font-size: 1.1rem; color: #0f172a; }',
    '    .transcript-block { display: grid; gap: 12px; }',
    '    .transcript-block h3 { margin: 0; font-size: 0.95rem; color: #0f172a; }',
    '    pre { background: #0f172a; color: #e2e8f0; padding: 12px; border-radius: 6px; overflow: auto; white-space: pre-wrap; word-break: break-word; font-size: 0.9rem; }',
    '  </style>',
    '</head>',
    '<body>',
    '  <main>',
    '    <header>',
    `      <h1>Agenten-Transkript für ${escapeHtml(itemId)}</h1>`,
    `      <p class="transcript-meta">Zuletzt aktualisiert: ${escapeHtml(updatedDisplay)}</p>`,
    '    </header>'
  ].join('\n');
}

export function buildTranscriptBody(
  request: TranscriptSectionPayload | unknown,
  response: string,
  logger?: AgentTranscriptLogger | null,
  meta?: { heading?: string; itemId?: string }
): string {
  const fallbackRender = (): string => {
    const requestBlock = escapeHtml(stringifyTranscriptPayload(request, logger, meta));
    const responseBlock = escapeHtml(typeof response === 'string' ? response : String(response));
    return [
      '<div class="transcript-block" data-kind="request-response">',
      '  <h3>Request</h3>',
      `  <pre>${requestBlock}</pre>`,
      '  <h3>Response</h3>',
      `  <pre>${responseBlock.trim()}</pre>`,
      '</div>'
    ].join('\n');
  };

  try {
    const structured =
      request && typeof request === 'object' && !Array.isArray(request)
        ? (request as TranscriptSectionPayload)
        : undefined;

    const blocks: string[] = [];
    const requestBody = structured?.request ?? request;
    const responseBody = structured?.response ?? response;

    if (structured?.messages?.length) {
      const messageLines = structured.messages.map((message, index) => {
        const label = [message.role, message.type].filter(Boolean).join(' • ') || `Message ${index + 1}`;
        return [
          `  <article class="transcript-entry" data-kind="message" data-role="${escapeHtml(message.role ?? 'unknown')}">`,
          `    <h4>${escapeHtml(label)}</h4>`,
          `    <pre>${escapeHtml(message.content ?? '')}</pre>`,
          '  </article>'
        ].join('\n');
      });

      blocks.push(
        [
          '<div class="transcript-block" data-kind="messages">',
          '  <h3>Messages</h3>',
          ...messageLines,
          '</div>'
        ].join('\n')
      );
    }

    if (structured?.toolInvocations?.length) {
      const toolLines = structured.toolInvocations.map((tool, index) => {
        const heading = tool.name ? `${tool.name} (${tool.status ?? 'pending'})` : `Tool ${index + 1}`;
        const inputBlock = stringifyTranscriptPayload(tool.input, logger, meta);
        const outputBlock = stringifyTranscriptPayload(tool.output, logger, meta);
        return [
          `  <article class="transcript-entry" data-kind="tool" data-name="${escapeHtml(tool.name ?? 'unknown')}">`,
          `    <h4>${escapeHtml(heading)}</h4>`,
          '    <h5>Input</h5>',
          `    <pre>${escapeHtml(inputBlock)}</pre>`,
          '    <h5>Output</h5>',
          `    <pre>${escapeHtml(outputBlock)}</pre>`,
          '  </article>'
        ].join('\n');
      });

      blocks.push(
        [
          '<div class="transcript-block" data-kind="tool-invocations">',
          '  <h3>Tool Calls</h3>',
          ...toolLines,
          '</div>'
        ].join('\n')
      );
    }

    if (structured?.logLines?.length) {
      const logItems = structured.logLines.map((line) => `    <li>${escapeHtml(line)}</li>`);
      blocks.push(
        [
          '<div class="transcript-block" data-kind="logs">',
          '  <h3>Logs</h3>',
          '  <ul>',
          ...logItems,
          '  </ul>',
          '</div>'
        ].join('\n')
      );
    }

    if (structured?.errors?.length) {
      const errorBlocks = structured.errors.map((err, index) => {
        const serializedError = stringifyTranscriptPayload(err, logger, meta);
        return [
          `  <article class="transcript-entry" data-kind="error" data-index="${index}">`,
          `    <h4>Error ${index + 1}</h4>`,
          `    <pre>${escapeHtml(serializedError)}</pre>`,
          '  </article>'
        ].join('\n');
      });

      blocks.push(
        [
          '<div class="transcript-block" data-kind="errors">',
          '  <h3>Errors</h3>',
          ...errorBlocks,
          '</div>'
        ].join('\n')
      );
    }

    const requestBlock = escapeHtml(stringifyTranscriptPayload(requestBody, logger, meta));
    const responseBlock = escapeHtml(
      typeof responseBody === 'string' ? responseBody : stringifyTranscriptPayload(responseBody, logger, meta)
    );

    blocks.push(
      [
        '<div class="transcript-block" data-kind="request-response">',
        '  <h3>Request</h3>',
        `  <pre>${requestBlock}</pre>`,
        '  <h3>Response</h3>',
        `  <pre>${responseBlock.trim()}</pre>`,
        '</div>'
      ].join('\n')
    );

    return blocks.join('\n');
  } catch (err) {
    logger?.warn?.({ err, msg: 'failed to build structured transcript body', heading: meta?.heading, itemId: meta?.itemId });
    return fallbackRender();
  }
}

function buildTranscriptReference(itemId: string, logger?: AgentTranscriptLogger | null): AgentTranscriptReference {
  const fallbackLogger = logger ?? console;
  const safeLogger: Pick<Console, 'warn' | 'error' | 'info'> = {
    warn: fallbackLogger.warn ?? console.warn,
    error: fallbackLogger.error ?? console.error,
    info: fallbackLogger.info ?? console.info
  };
  const mediaFolder = resolveMediaFolder(itemId, null, safeLogger);
  const filePath = resolveMediaPath(mediaFolder, TRANSCRIPT_FILE_NAME);
  const publicUrl = `/media/${encodeURIComponent(mediaFolder)}/${TRANSCRIPT_FILE_NAME}`;
  return { filePath, publicUrl };
}

export function locateTranscript(itemId: string, logger?: AgentTranscriptLogger | null): AgentTranscriptReference | null {
  const reference = buildTranscriptReference(itemId, logger);
  const legacyHtmlReference: AgentTranscriptReference = {
    filePath: resolveMediaPath(itemId, TRANSCRIPT_FILE_NAME),
    publicUrl: `/media/${encodeURIComponent(itemId)}/${TRANSCRIPT_FILE_NAME}`
  };
  const legacyReference: AgentTranscriptReference = {
    filePath: resolveMediaPath(itemId, 'agentic-transcript.md'),
    publicUrl: `/media/${encodeURIComponent(itemId)}/agentic-transcript.md`
  };
  try {
    if (fs.existsSync(reference.filePath)) {
      return reference;
    }
    if (fs.existsSync(legacyHtmlReference.filePath)) {
      logger?.warn?.({
        msg: 'serving legacy html transcript',
        itemId,
        transcriptPath: legacyHtmlReference.filePath
      });
      return legacyHtmlReference;
    }
    if (fs.existsSync(legacyReference.filePath)) {
      logger?.warn?.({
        msg: 'serving legacy markdown transcript',
        itemId,
        transcriptPath: legacyReference.filePath
      });
      return legacyReference;
    }
    return null;
  } catch (err) {
    logger?.warn?.({ err, msg: 'failed to check transcript presence', itemId, transcriptPath: reference.filePath });
    return null;
  }
}

export async function createTranscriptWriter(
  itemId: string,
  logger?: AgentTranscriptLogger | null
): Promise<AgentTranscriptWriter | null> {
  const reference = buildTranscriptReference(itemId, logger);
  const nowIso = new Date().toISOString();
  const header = `${buildTranscriptHeader(itemId, nowIso)}\n${TRANSCRIPT_SECTION_MARKER}\n${TRANSCRIPT_FOOTER}`;
  let fileExists = false;

  try {
    await fsPromises.mkdir(path.dirname(reference.filePath), { recursive: true });
  } catch (err) {
    logger?.error?.({ err, msg: 'failed to prepare transcript directory', itemId, transcriptPath: reference.filePath });
    return null;
  }

  try {
    fileExists = fs.existsSync(reference.filePath);
  } catch (err) {
    logger?.warn?.({ err, msg: 'failed to detect transcript presence before initialization', itemId });
  }

  try {
    if (!fileExists) {
      await fsPromises.writeFile(reference.filePath, header);
    }
  } catch (err) {
    logger?.error?.({ err, msg: 'failed to initialize transcript file', itemId, transcriptPath: reference.filePath });
    return null;
  }

  const appendSection = async (heading: string, body: string): Promise<void> => {
    try {
      const timestampIso = new Date().toISOString();
      const sectionLines = [
        `<section class="transcript-section">`,
        `  <h2>${escapeHtml(heading)}</h2>`,
        `  <div class="transcript-meta">${escapeHtml(timestampIso)}</div>`,
        body.trimEnd(),
        '</section>',
        ''
      ];

      let existingContent = await fsPromises.readFile(reference.filePath, 'utf8');
      let markerIndex = existingContent.indexOf(TRANSCRIPT_SECTION_MARKER);
      if (markerIndex === -1) {
        logger?.warn?.({ msg: 'transcript section marker missing, rewriting file', itemId, transcriptPath: reference.filePath });
        existingContent = `${buildTranscriptHeader(itemId, timestampIso)}\n${TRANSCRIPT_SECTION_MARKER}\n${TRANSCRIPT_FOOTER}`;
        markerIndex = existingContent.indexOf(TRANSCRIPT_SECTION_MARKER);
      }

      const footerIndex = existingContent.lastIndexOf(TRANSCRIPT_FOOTER);
      const withoutFooter = footerIndex === -1
        ? existingContent
        : existingContent.slice(0, footerIndex);

      const updatedHeader = buildTranscriptHeader(itemId, timestampIso);
      const preservedSections = withoutFooter.slice(markerIndex + TRANSCRIPT_SECTION_MARKER.length).trimStart();
      const newSections = [preservedSections, sectionLines.join('\n')].filter(Boolean).join('\n');
      const nextContent = [`${updatedHeader}`, TRANSCRIPT_SECTION_MARKER, newSections, TRANSCRIPT_FOOTER].join('\n');
      await fsPromises.writeFile(reference.filePath, nextContent);
    } catch (err) {
      logger?.warn?.({ err, msg: 'failed to append transcript section', itemId, heading, transcriptPath: reference.filePath });
    }
  };

  return { ...reference, appendSection };
}

export async function appendTranscriptSection(
  writer: AgentTranscriptWriter | null | undefined,
  heading: string,
  request: TranscriptSectionPayload | unknown,
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
