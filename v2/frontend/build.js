const { build } = require('esbuild');

async function bundle() {
  try {
    await build({
      entryPoints: ['v2/frontend/src/index.tsx'],
      bundle: true,
      outfile: 'v2/frontend/public/bundle.js',
      sourcemap: true,
      logLevel: 'info'
    });
    console.log('Bundled frontend to v2/frontend/public/bundle.js');
  } catch (err) {
    console.error('Failed to bundle frontend', err);
    process.exit(1);
  }
}

bundle();
