import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import {
  PRINTER_QUEUE,
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
  if (jobName && jobName.trim()) {
    args.push('-t', jobName.trim());
  }
  args.push(absolute);

  console.log('[print] Dispatching file to printer', {
    command: LP_COMMAND,
    args,
    timeoutMs: resolvedTimeout
  });

  return await new Promise<PrintFileResult>((resolve) => {
    try {
      const child = spawn(LP_COMMAND, args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      let settled = false;
      const timer = setTimeout(() => {
        console.error('[print] Print command timed out; terminating process', {
          command: LP_COMMAND,
          args,
          timeoutMs: resolvedTimeout
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
      }, resolvedTimeout);

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
          command: LP_COMMAND,
          args,
          error: err
        });
        finish({ sent: false, reason: err.message, artifactPath: absolute });
      });

      child.once('close', (code, signal) => {
        if (code === 0) {
          console.log('[print] Print command completed successfully', {
            command: LP_COMMAND,
            args,
            stdout: stdout.trim()
          });
          finish({ sent: true, code, signal: signal ?? null, artifactPath: absolute });
          return;
        }

        console.error('[print] Print command exited with failure', {
          command: LP_COMMAND,
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
          artifactPath: absolute
        });
      });
    } catch (err) {
      console.error('[print] Unexpected error while spawning print command', {
        command: LP_COMMAND,
        args,
        error: err
      });
      resolve({ sent: false, reason: (err as Error).message, artifactPath: absolute });
    }
  });
}

export function testPrinterConnection(
  queue: string = PRINTER_QUEUE,
  timeoutMs: number = PRINT_TIMEOUT_MS
): Promise<{ ok: boolean; reason?: string }> {
  const normalizedQueue = (queue || '').trim();
  if (!normalizedQueue) {
    console.warn('[print] testPrinterConnection invoked without a configured queue');
    return Promise.resolve({ ok: false, reason: 'printer_queue_not_configured' });
  }

  return new Promise((resolve) => {
    try {
      const child = spawn(LPSTAT_COMMAND, ['-p', normalizedQueue], {
        stdio: ['ignore', 'pipe', 'pipe']
      });
      let stdout = '';
      let stderr = '';
      let settled = false;

      const timer = setTimeout(() => {
        console.error('[print] lpstat command timed out', {
          command: LPSTAT_COMMAND,
          queue: normalizedQueue,
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
          queue: normalizedQueue,
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
          queue: normalizedQueue,
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

export default { printFile, testPrinterConnection };
