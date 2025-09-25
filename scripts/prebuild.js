const fs = require('fs');
const path = require('path');

const inputPath = path.join(__dirname, '..', 'frontend', 'public', 'styles.scss');
const outputPath = path.join(__dirname, '..', 'frontend', 'public', 'styles.css');

function ensureOutputFile() {
  if (!fs.existsSync(outputPath)) {
    fs.writeFileSync(outputPath, '', 'utf8');
  }
}

try {
  const sass = require('sass');
  const result = sass.compile(inputPath);
  fs.writeFileSync(outputPath, result.css, 'utf8');
  console.log(`[prebuild] Successfully compiled Sass to ${outputPath}`);
} catch (error) {
  if (error.code === 'MODULE_NOT_FOUND') {
    console.warn('[prebuild] `sass` module not found. Skipping Sass compilation and creating empty CSS file for CI.');
    ensureOutputFile();
  } else {
    console.error('[prebuild] Unexpected error during Sass compilation:', error);
    throw error;
  }
}
