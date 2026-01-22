// TODO(agent): Confirm Docker runtime renderer install stays in sync with PRINT_RENDERER docs.
import fs from 'fs';
import path from 'path';
import { spawn, spawnSync } from 'child_process';

// TODO(agent): Expand renderer discovery once container images bundle a stable headless PDF toolchain.
const DEFAULT_RENDERERS = [
  (process.env.PRINT_RENDERER || '').trim(),
  'chromium-browser',
  'google-chrome',
  'chromium',
  'wkhtmltopdf'
].filter(Boolean);
const DEFAULT_RENDER_TIMEOUT_MS = Number.isFinite(Number(process.env.PRINT_RENDER_TIMEOUT_MS))
  ? Number(process.env.PRINT_RENDER_TIMEOUT_MS)
  : 10000;

export interface HtmlToPdfOptions {
  htmlPath: string;
  outputPath?: string;
  rendererCommand?: string;
  rendererArgs?: string[];
  timeoutMs?: number;
  logger?: Console;
}

function commandExists(command: string): boolean {
  try {
    const probe = spawnSync(command, ['--version'], { stdio: 'ignore' });
    if (probe.error && (probe.error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    return !probe.error;
  } catch (err) {
    return false;
  }
}

function resolveRenderer(preferred?: string): string | null {
  const candidates = [preferred, ...DEFAULT_RENDERERS];
  for (const candidate of candidates) {
    if (!candidate || !candidate.trim()) continue;
    if (commandExists(candidate.trim())) {
      return candidate.trim();
    }
  }
  return null;
}

function buildRendererArgs(command: string, htmlPath: string, outputPath: string, customArgs?: string[]): string[] {
  if (Array.isArray(customArgs) && customArgs.length > 0) {
    return customArgs;
  }

  if (command.toLowerCase().includes('wkhtmltopdf')) {
    return [htmlPath, outputPath];
  }

  return ['--headless', '--disable-gpu', '--no-sandbox', `--print-to-pdf=${outputPath}`, htmlPath];
}

export async function renderHtmlToPdf(options: HtmlToPdfOptions): Promise<string> {
  const { htmlPath, rendererCommand, outputPath, rendererArgs, timeoutMs, logger = console } = options;
  const absoluteHtml = path.resolve(htmlPath);
  const resolvedOutput = path.resolve(
    outputPath || absoluteHtml.replace(/\.html?$/i, '') + '.pdf'
  );
  const renderTimeout = Number.isFinite(timeoutMs) && timeoutMs ? timeoutMs : DEFAULT_RENDER_TIMEOUT_MS;

  if (!fs.existsSync(absoluteHtml)) {
    const error = new Error('html_source_missing');
    logger.error('[label-pdf] Source HTML not found for rendering', { htmlPath: absoluteHtml });
    throw error;
  }

  try {
    fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
  } catch (dirErr) {
    logger.error('[label-pdf] Failed to prepare output directory for PDF rendering', {
      outputDir: path.dirname(resolvedOutput),
      error: dirErr
    });
    throw dirErr;
  }

  const resolvedRenderer = resolveRenderer(rendererCommand);
  if (!resolvedRenderer) {
    const error = new Error('renderer_not_available');
    logger.error('[label-pdf] No available HTML-to-PDF renderer found', { rendererCommand });
    throw error;
  }

  const args = buildRendererArgs(resolvedRenderer, absoluteHtml, resolvedOutput, rendererArgs);
  logger.info('[label-pdf] Rendering HTML to PDF', {
    renderer: resolvedRenderer,
    args,
    htmlPath: absoluteHtml,
    outputPath: resolvedOutput,
    timeoutMs: renderTimeout
  });

  return await new Promise<string>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let child: ReturnType<typeof spawn> | null = null;

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) {
        reject(err);
      } else {
        resolve(resolvedOutput);
      }
    };

    const timer = setTimeout(() => {
      logger.error('[label-pdf] Renderer timed out', {
        renderer: resolvedRenderer,
        args,
        timeoutMs: renderTimeout
      });
      try {
        child?.kill('SIGKILL');
      } catch (killErr) {
        logger.error('[label-pdf] Failed to terminate timed-out renderer process', killErr);
      }
      finish(new Error('render_timeout'));
    }, renderTimeout);

    try {
      child = spawn(resolvedRenderer, args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch (spawnErr) {
      logger.error('[label-pdf] Failed to start renderer process', {
        renderer: resolvedRenderer,
        args,
        error: spawnErr
      });
      clearTimeout(timer);
      return reject(spawnErr);
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.once('error', (err) => {
      logger.error('[label-pdf] Renderer process failed', {
        renderer: resolvedRenderer,
        args,
        error: err
      });
      finish(err as Error);
    });

    child.once('close', (code, signal) => {
      if (code === 0) {
        logger.info('[label-pdf] Rendered PDF successfully', {
          renderer: resolvedRenderer,
          args,
          stdout: stdout.trim(),
          outputPath: resolvedOutput
        });
        finish();
        return;
      }

      const error = new Error(`render_exit_${code ?? 'unknown'}`);
      logger.error('[label-pdf] Renderer exited with failure', {
        renderer: resolvedRenderer,
        args,
        code,
        signal,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
      finish(error);
    });
  });
}
