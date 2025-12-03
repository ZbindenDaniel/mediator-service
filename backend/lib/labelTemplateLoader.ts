import fs from 'fs';
import path from 'path';

export type LabelHtmlTemplate = '62x100';

// TODO(agent): Align template root discovery with server PUBLIC_DIR detection to avoid missing runtime assets.
const TEMPLATE_FILES: Record<LabelHtmlTemplate, string> = {
  '62x100': '62x100.html'
};

const TEMPLATE_ROOTS = [
  path.join(__dirname, '../frontend/public/print'),
  path.join(__dirname, '../../..', 'frontend', 'public', 'print')
];

const templateCache = new Map<LabelHtmlTemplate, string>();

function loadTemplateContent(template: LabelHtmlTemplate, logger: Console = console): string {
  if (templateCache.has(template)) {
    return templateCache.get(template) as string;
  }

  const filename = TEMPLATE_FILES[template];
  const attemptedPaths: string[] = [];
  for (const root of TEMPLATE_ROOTS) {
    const candidate = path.join(root, filename);
    attemptedPaths.push(candidate);
    try {
      if (fs.existsSync(candidate)) {
        const html = fs.readFileSync(candidate, 'utf8');
        templateCache.set(template, html);
        logger.debug?.('[label-template-loader] Loaded template', { template, candidate });
        return html;
      }
    } catch (err) {
      logger.error('[label-template-loader] Failed to read template candidate', { candidate, error: err });
    }
  }

  logger.error('[label-template-loader] Template not found in expected roots', {
    template,
    attemptedPaths
  });
  throw new Error(`Template ${template} not found in configured roots`);
}

function injectPayload(html: string, payload: Record<string, unknown>, logger: Console = console): string {
  const serializedPayload = JSON.stringify(payload).replace(/</g, '\\u003c');
  const payloadScript = `\n<script>window.__LABEL_PAYLOAD__ = ${serializedPayload};</script>\n`;

  if (html.includes('</body>')) {
    return html.replace('</body>', `${payloadScript}</body>`);
  }

  logger.warn('[label-template-loader] Template missing </body>; appending payload script at end of file');
  return `${html}${payloadScript}`;
}

export interface RenderLabelTemplateOptions {
  template: LabelHtmlTemplate;
  payload: Record<string, unknown>;
  outPath: string;
  logger?: Console;
}

export async function renderLabelTemplate(options: RenderLabelTemplateOptions): Promise<void> {
  const { template, payload, outPath, logger = console } = options;
  try {
    const html = loadTemplateContent(template, logger);
    const rendered = injectPayload(html, payload, logger);
    await fs.promises.writeFile(outPath, rendered, 'utf8');
    logger.info('[label-template-loader] Rendered label template', { template, outPath });
  } catch (err) {
    logger.error('[label-template-loader] Failed to render label template', {
      template,
      outPath,
      error: err
    });
    throw err;
  }
}
