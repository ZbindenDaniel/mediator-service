import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import {
  PRINTER_QUEUE,
  PRINTER_QUEUE_BOX,
  PRINTER_QUEUE_ITEM,
  PRINTER_QUEUE_ITEM_SMALL,
  PRINTER_QUEUE_SHELF,
  PRINTER_SERVER,
  LP_COMMAND,
  LPSTAT_COMMAND,
  PRINT_TIMEOUT_MS
} from './config';
import { renderHtmlToPdf, type HtmlToPdfOptions } from './labelpdf';

// TODO(agent): Unify renderer selection with PDF preview generation once headless dependencies stabilize.

export interface PrintFileOptions {
  filePath: string;
  jobName?: string;
  printerQueue?: string;
  timeoutMs?: number;
  renderMode?: 'raw' | 'html-to-pdf';
  renderOptions?: Pick<HtmlToPdfOptions, 'rendererCommand' | 'rendererArgs' | 'timeoutMs'>;
}

export interface PrintFileResult {
  sent: boolean;
  reason?: string;
  code?: number | null;
  signal?: NodeJS.Signals | null;
  artifactPath?: string;
}

// TODO(agent): Keep print retry behaviour minimal and shared across lp/lpstat operations.

export type PrintLabelType = 'box' | 'item' | 'shelf' | 'smallitem';
export type PrinterQueueSource = 'label' | 'default' | 'missing';

export interface PrinterQueueResolution {
  queue: string;
  source: PrinterQueueSource;
}

export function resolvePrinterQueue(
  labelType: PrintLabelType,
  logger: Pick<Console, 'warn'> = console
): PrinterQueueResolution {
  let queue = '';
  switch (labelType) {
    case 'box':
      queue = PRINTER_QUEUE_BOX;
      break;
    case 'item':
      queue = PRINTER_QUEUE_ITEM;
      break;
    case 'smallitem':
      queue = PRINTER_QUEUE_ITEM_SMALL;
      break;
    case 'shelf':
      queue = PRINTER_QUEUE_SHELF;
      break;
    default:
      queue = '';
  }

  if (queue) {
    return { queue, source: 'label' };
  }

  if (PRINTER_QUEUE) {
    logger.warn(`[print] ${labelType} queue not configured; falling back to PRINTER_QUEUE.`);
    return { queue: PRINTER_QUEUE, source: 'default' };
  }

  logger.warn(`[print] ${labelType} queue not configured and PRINTER_QUEUE is empty.`);
  return { queue: '', source: 'missing' };
}

function validateFilePath(filePath: string): { ok: boolean; reason?: string } {
  if (!filePath) {
    return { ok: false, reason: 'missing_file_path' };
  }

  const absolute = path.resolve(filePath);
  if (!fs.existsSync(absolute)) {
    return { ok: false, reason: 'file_not_found' };
  }

  const stat = fs.statSync(absolute);
  if (!stat.isFile()) {
    return { ok: false, reason: 'invalid_file' };
  }

  return { ok: true };
}

function parsePositiveIntEnv(raw: string | undefined, fallback: number, label: string): number {
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  if (raw && raw.trim()) {
    console.warn('[print] Invalid retry env value; using fallback', { label, raw, fallback });
  }

  return fallback;
}

function resolveRetryConfig(): { attempts: number; baseDelayMs: number } {
  return {
    attempts: parsePositiveIntEnv(process.env.PRINT_RETRY_ATTEMPTS, 3, 'PRINT_RETRY_ATTEMPTS'),
    baseDelayMs: parsePositiveIntEnv(process.env.PRINT_RETRY_BASE_MS, 200, 'PRINT_RETRY_BASE_MS')
  };
}

function computeRetryDelayMs(baseDelayMs: number, attempt: number): number {
  const exponentialDelay = baseDelayMs * Math.pow(2, Math.max(0, attempt - 1));
  const jitterMs = Math.floor(Math.random() * Math.max(1, Math.floor(baseDelayMs / 2)));
  return exponentialDelay + jitterMs;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientPrintFailure(reason: string | undefined): boolean {
  if (!reason) {
    return false;
  }

  const normalized = reason.toLowerCase();
  return (
    normalized.includes('connection refused') ||
    normalized.includes('timed out') ||
    normalized.includes('timeout') ||
    normalized.includes('network is unreachable') ||
    normalized.includes('cups unavailable') ||
    normalized.includes('cups is unavailable') ||
    normalized.includes('econnrefused') ||
    normalized.includes('etimedout') ||
    normalized.includes('enetunreach') ||
    normalized.includes('ehostunreach') ||
    normalized.includes('eai_again') ||
    normalized === 'print_timeout' ||
    normalized === 'status_timeout'
  );
}

async function runWithRetry<T>(options: {
  queue: string;
  printerHost: string;
  operation: 'printFile' | 'testPrinterConnection';
  attemptOnce: () => Promise<T>;
  isSuccess: (result: T) => boolean;
  getReason: (result: T) => string | undefined;
}): Promise<T> {
  const { attempts: maxAttempts, baseDelayMs } = resolveRetryConfig();
  const { queue, printerHost, operation, attemptOnce, isSuccess, getReason } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await attemptOnce();
    if (isSuccess(result)) {
      console.log('[print] Print operation completed', {
        operation,
        attempt,
        maxAttempts,
        queue,
        printerHost,
        outcome: 'success'
      });
      return result;
    }

    const reason = getReason(result) || 'unknown_error';
    const transient = isTransientPrintFailure(reason);
    console.warn('[print] Print operation attempt failed', {
      operation,
      attempt,
      maxAttempts,
      queue,
      printerHost,
      reason,
      transient
    });

    if (!transient || attempt >= maxAttempts) {
      console.error('[print] Print operation failed', {
        operation,
        attempt,
        maxAttempts,
        queue,
        printerHost,
        reason,
        outcome: 'failed'
      });
      return result;
    }

    const delayMs = computeRetryDelayMs(baseDelayMs, attempt);
    console.log('[print] Retrying transient print operation failure', {
      operation,
      attempt,
      maxAttempts,
      queue,
      printerHost,
      reason,
      delayMs
    });
    await wait(delayMs);
  }

  return await attemptOnce();
}

async function runPrintFileAttempt(options: {
  args: string[];
  command: string;
  timeoutMs: number;
  artifactPath: string;
}): Promise<PrintFileResult> {
  const { args, command, timeoutMs, artifactPath } = options;

  return await new Promise<PrintFileResult>((resolve) => {
    try {
      const child = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      let settled = false;
      const timer = setTimeout(() => {
        console.error('[print] Print command timed out; terminating process', {
          command,
          args,
          timeoutMs
        });
        try {
          child.kill('SIGKILL');
        } catch (killError) {
          console.error('[print] Failed to terminate timed-out print process', killError);
        }
        if (!settled) {
          settled = true;
          resolve({ sent: false, reason: 'print_timeout' });
        }
      }, timeoutMs);

      const finish = (result: PrintFileResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };

      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.once('error', (err) => {
        console.error('[print] Print process failed to start', {
          command,
          args,
          error: err
        });
        finish({ sent: false, reason: err.message, artifactPath });
      });

      child.once('close', (code, signal) => {
        if (code === 0) {
          console.log('[print] Print command completed successfully', {
            command,
            args,
            stdout: stdout.trim()
          });
          finish({ sent: true, code, signal: signal ?? null, artifactPath });
          return;
        }

        console.error('[print] Print command exited with failure', {
          command,
          args,
          code,
          signal,
          stdout: stdout.trim(),
          stderr: stderr.trim()
        });
        finish({
          sent: false,
          reason: stderr.trim() || stdout.trim() || `exit_code_${code ?? 'unknown'}`,
          code,
          signal: signal ?? null,
          artifactPath
        });
      });
    } catch (err) {
      console.error('[print] Unexpected error while spawning print command', {
        command,
        args,
        error: err
      });
      resolve({ sent: false, reason: (err as Error).message, artifactPath });
    }
  });
}

export async function printFile(options: PrintFileOptions): Promise<PrintFileResult> {
  const { filePath, jobName, timeoutMs, printerQueue, renderMode = 'raw', renderOptions } = options;
  const effectiveQueue = (printerQueue || PRINTER_QUEUE || '').trim();
  const resolvedTimeout = Number.isFinite(timeoutMs) && timeoutMs ? timeoutMs : PRINT_TIMEOUT_MS;
  const validation = validateFilePath(filePath);
  if (!validation.ok) {
    console.error('[print] Refusing to send file; invalid file path', {
      filePath,
      reason: validation.reason
    });
    return { sent: false, reason: validation.reason };
  }

  if (!effectiveQueue) {
    console.error('[print] Printer queue not configured; aborting print', {
      filePath
    });
    return { sent: false, reason: 'printer_queue_not_configured' };
  }

  const printerHost = (PRINTER_SERVER || '').trim();
  if (!printerHost) {
    console.warn('[print] Printer host not configured; relying on local CUPS defaults.');
  }

  let artifactPath = path.resolve(filePath);
  if (renderMode === 'html-to-pdf') {
    try {
      artifactPath = await renderHtmlToPdf({
        htmlPath: artifactPath,
        rendererCommand: renderOptions?.rendererCommand,
        rendererArgs: renderOptions?.rendererArgs,
        timeoutMs: renderOptions?.timeoutMs ?? resolvedTimeout,
        logger: console
      });
    } catch (renderErr) {
      console.error('[print] Failed to render HTML label before printing', {
        sourcePath: artifactPath,
        error: renderErr
      });
      return { sent: false, reason: (renderErr as Error).message };
    }

    const renderedValidation = validateFilePath(artifactPath);
    if (!renderedValidation.ok) {
      console.error('[print] Rendered artifact missing or invalid after HTML conversion', {
        artifactPath,
        reason: renderedValidation.reason
      });
      return { sent: false, reason: renderedValidation.reason };
    }
  }

  const absolute = artifactPath;
  const args = ['-d', effectiveQueue];
  if (printerHost) {
    args.push('-h', printerHost);
  }
  if (jobName && jobName.trim()) {
    args.push('-t', jobName.trim());
  }
  args.push(absolute);

  console.log('[print] Dispatching file to printer', {
    command: LP_COMMAND,
    args,
    timeoutMs: resolvedTimeout
  });

  return await runWithRetry<PrintFileResult>({
    operation: 'printFile',
    queue: effectiveQueue,
    printerHost,
    attemptOnce: async () =>
      await runPrintFileAttempt({
        args,
        command: LP_COMMAND,
        timeoutMs: resolvedTimeout,
        artifactPath: absolute
      }),
    isSuccess: (result) => result.sent,
    getReason: (result) => result.reason
  });
}

async function runPrinterConnectionAttempt(options: {
  queue: string;
  timeoutMs: number;
}): Promise<{ ok: boolean; reason?: string }> {
  const { queue, timeoutMs } = options;

  return await new Promise((resolve) => {
    try {
      const child = spawn(LPSTAT_COMMAND, ['-p', queue], {
        stdio: ['ignore', 'pipe', 'pipe']
      });
      let stdout = '';
      let stderr = '';
      let settled = false;

      const timer = setTimeout(() => {
        console.error('[print] lpstat command timed out', {
          command: LPSTAT_COMMAND,
          queue,
          timeoutMs
        });
        try {
          child.kill('SIGKILL');
        } catch (killError) {
          console.error('[print] Failed to terminate timed-out lpstat process', killError);
        }
        if (!settled) {
          settled = true;
          resolve({ ok: false, reason: 'status_timeout' });
        }
      }, timeoutMs);

      const finish = (result: { ok: boolean; reason?: string }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };

      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.once('error', (err) => {
        console.error('[print] lpstat failed to start', {
          command: LPSTAT_COMMAND,
          queue,
          error: err
        });
        finish({ ok: false, reason: err.message });
      });

      child.once('close', (code) => {
        if (code === 0) {
          const output = stdout.trim();
          const online = /printer\s+\S+\s+is\s+idle|ready/i.test(output);
          finish({ ok: online, reason: online ? undefined : 'printer_not_ready' });
          return;
        }

        console.error('[print] lpstat command failed', {
          command: LPSTAT_COMMAND,
          queue,
          code,
          stderr: stderr.trim()
        });
        finish({ ok: false, reason: stderr.trim() || `lpstat_exit_${code ?? 'unknown'}` });
      });
    } catch (err) {
      console.error('[print] Unexpected error during printer status probe', err);
      resolve({ ok: false, reason: (err as Error).message });
    }
  });
}

export async function testPrinterConnection(
  queue: string = PRINTER_QUEUE,
  timeoutMs: number = PRINT_TIMEOUT_MS
): Promise<{ ok: boolean; reason?: string }> {
  const normalizedQueue = (queue || '').trim();
  if (!normalizedQueue) {
    console.warn('[print] testPrinterConnection invoked without a configured queue');
    return Promise.resolve({ ok: false, reason: 'printer_queue_not_configured' });
  }

  const printerHost = (PRINTER_SERVER || '').trim();
  return await runWithRetry<{ ok: boolean; reason?: string }>({
    operation: 'testPrinterConnection',
    queue: normalizedQueue,
    printerHost,
    attemptOnce: async () => await runPrinterConnectionAttempt({ queue: normalizedQueue, timeoutMs }),
    isSuccess: (result) => result.ok,
    getReason: (result) => result.reason
  });
}

export default { printFile, testPrinterConnection };
