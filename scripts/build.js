const fs = require('fs');
const { copyFile } = require('fs/promises');
const path = require('path');

// TODO: Monitor additional asset folders that need to be mirrored into the dist output.
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

function copyAgenticPrompts() {
  const src = path.join(__dirname, '..', 'backend', 'agentic', 'prompts');
  const dest = path.join(__dirname, '..', 'dist', 'backend', 'agentic', 'prompts');

  
  
  if (!fs.existsSync(src)) {
    console.log('[build] No agentic prompts directory to copy.', { src });
    return;
  }
  
  try {
    copyDirectory(src, dest);
    
    // also copy certain files from the 'docs'
    fs.mkdirSync(path.join(dest, 'docs'), { recursive: true });
    copyFile(
      path.join(__dirname, '..', 'docs', 'data_struct.md'),
      path.join(dest, 'docs', 'data_struct.md')
    );

    console.log('[build] Copied agentic prompts.', { dest });
  } catch (error) {
    console.error('[build] Failed to copy agentic prompts.', { src, dest, error });
    throw error;
  }
}

try {
  copyFrontendPublic();
  copyModelResources();
  copyAgenticPrompts();
} catch (error) {
  console.error('[build] Build script encountered an unrecoverable error.', error);
  process.exit(1);
}
