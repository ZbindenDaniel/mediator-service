// TODO(frontend-bundle): Confirm svg loader strategy matches runtime asset expectations.
async function bundle() {
  try {
    const { build } = require('esbuild');
    await build({
      entryPoints: ['frontend/src/index.tsx'],
      bundle: true,
      outfile: 'frontend/public/bundle.js',
      sourcemap: true,
      logLevel: 'info',
      loader: {
        '.svg': 'file'
      }
    });
    console.log('Bundled frontend to frontend/public/bundle.js');
  } catch (err) {
    if (err?.code === 'MODULE_NOT_FOUND') {
      console.error('[bundle] esbuild not available');
      throw new Error("Bundle error")
      return;
    }
    console.error('Failed to bundle frontend', err);
    process.exit(1);
  }
}

bundle().catch((err) => {
  console.error('Unexpected bundle error', err);
  process.exit(1);
});
