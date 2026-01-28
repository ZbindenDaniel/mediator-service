import fs from 'fs';
import path from 'path';

// TODO(agent): Revisit shelf template registration if additional label sizes are introduced.
// TODO(agent): Align new label template additions with frontend print template inventory tracking.
// TODO(agent): Confirm small item template availability in all deployment environments.
export type LabelHtmlTemplate = '62x100' | '29x90' | '62x10' | 'shelf-a4';

// TODO(agent): Align template root discovery with server PUBLIC_DIR detection to avoid missing runtime assets.
const TEMPLATE_FILES: Record<LabelHtmlTemplate, string> = {
  '62x100': '62x100.html',
  '29x90': '29x90.html',
  '62x10': '62x10.html',
  'shelf-a4': 'shelf-a4.html'
};

// TODO(agent): Add ENV override for template roots when backend runs outside repo root.
const TEMPLATE_ROOTS = [
  path.join(__dirname, '..', '..', 'frontend', 'public', 'print'),
  path.join(process.cwd(), 'frontend', 'public', 'print'),
  path.join(__dirname, '..', '..', '..', '..', 'frontend', 'public', 'print')
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

  const firstScriptIndex = html.indexOf('<script');
  if (firstScriptIndex >= 0) {
    logger.debug?.('[label-template-loader] Injecting payload script before first <script> tag');
    return `${html.slice(0, firstScriptIndex)}${payloadScript}${html.slice(firstScriptIndex)}`;
  }

  if (html.includes('</head>')) {
    logger.warn('[label-template-loader] No <script> tags found; injecting payload before </head>');
    return html.replace('</head>', `${payloadScript}</head>`);
  }

  if (html.includes('</body>')) {
    logger.warn('[label-template-loader] No <script> tags found; injecting payload before </body>');
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
