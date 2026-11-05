// Builds the offline UI preview (frontend/dev/ui-preview.tsx) into a self-contained folder you can open
// in any browser — no server, DB, model or real item needed. Run: `npm run preview:ui`.
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'dist', 'ui-preview');

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // 1. Compile the real stylesheet so the preview looks like the app (best-effort).
  try {
    const sass = require('sass');
    const css = sass.compile(path.join(ROOT, 'frontend', 'public', 'styles.scss')).css;
    fs.writeFileSync(path.join(OUT_DIR, 'styles.css'), css, 'utf8');
  } catch (err) {
    console.warn('[preview] sass compile skipped:', err && err.message);
    fs.writeFileSync(path.join(OUT_DIR, 'styles.css'), '', 'utf8');
  }

  // 2. Bundle the preview entry (IIFE so it loads under file:// without a module server).
  const { build } = require('esbuild');
  await build({
    entryPoints: [path.join(ROOT, 'frontend', 'dev', 'ui-preview.tsx')],
    bundle: true,
    format: 'iife',
    outfile: path.join(OUT_DIR, 'ui-preview.js'),
    logLevel: 'info',
    loader: { '.svg': 'file' }
  });

  // 3. Emit the host page.
  const html = `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Agentic review — UI preview</title>
  <link rel="stylesheet" href="./styles.css" />
  <style>body{margin:0;background:#fff;color:#111;font-family:system-ui,sans-serif}</style>
</head>
<body>
  <div id="root"></div>
  <script src="./ui-preview.js"></script>
</body>
</html>
`;
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), html, 'utf8');

  console.log('\nUI preview built. Open this file in a browser:\n  ' + path.join(OUT_DIR, 'index.html') + '\n');
}

main().catch((err) => { console.error('Failed to build UI preview', err); process.exit(1); });
