const fs = require('fs');
const path = require('path');

function copyDirectory(src, dest) {
  try {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const sourcePath = path.join(src, entry.name);
      const targetPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        copyDirectory(sourcePath, targetPath);
      } else {
        fs.copyFileSync(sourcePath, targetPath);
      }
    }
  } catch (error) {
    console.error('[build] Failed to copy directory', { src, dest, error });
    throw error;
  }
}

function copyFrontendPublic() {
  const src = path.join(__dirname, '..', 'frontend', 'public');
  const dest = path.join(__dirname, '..', 'dist', 'frontend', 'public');

  if (!fs.existsSync(src)) {
    console.log('[build] No frontend public directory to copy.', { src });
    return;
  }

  try {
    copyDirectory(src, dest);
    console.log('Copied frontend public to', dest);
  } catch (error) {
    console.error('[build] Failed to copy frontend public assets.', error);
    throw error;
  }
}

function copyModelResources() {
  const src = path.join(__dirname, '..', 'models');
  const dest = path.join(__dirname, '..', 'dist', 'models');
  const resources = ['event-resources.json'];

  try {
    fs.mkdirSync(dest, { recursive: true });
    for (const resource of resources) {
      const resourceSource = path.join(src, resource);
      const resourceDest = path.join(dest, resource);

      if (!fs.existsSync(resourceSource)) {
        console.warn('[build] Model resource missing; skipping copy.', { resource, resourceSource });
        continue;
      }

      fs.copyFileSync(resourceSource, resourceDest);
      console.log('[build] Copied model resource.', { resource, resourceDest });
    }
  } catch (error) {
    console.error('[build] Failed to copy model resources.', error);
    throw error;
  }
}

try {
  copyFrontendPublic();
  copyModelResources();
} catch (error) {
  console.error('[build] Build script encountered an unrecoverable error.', error);
  process.exit(1);
}
