const { build } = require('esbuild');

async function bundle() {
  try {
    await build({
      entryPoints: ['frontend/src/index.tsx'],
      bundle: true,
      outfile: 'frontend/public/bundle.js',
      sourcemap: true,
      logLevel: 'info'
    });
    console.log('Bundled frontend to frontend/public/bundle.js');
  } catch (err) {
    console.error('Failed to bundle frontend', err);
    process.exit(1);
  }
}

bundle();
