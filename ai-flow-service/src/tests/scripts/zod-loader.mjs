import path from 'node:path';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const zodModulePath = path.join(repoRoot, 'node_modules', 'eventsource-parser', 'node_modules', 'zod', 'index.js');
const fallbackZodPath = path.join(repoRoot, 'node_modules', 'zod', 'index.js');

function resolveZodPath() {
  if (existsSync(zodModulePath)) {
    return zodModulePath;
  }
  if (existsSync(fallbackZodPath)) {
    return fallbackZodPath;
  }
  return zodModulePath;
}

export async function resolve(specifier, context, defaultResolve) {
  if (specifier === 'zod') {
    return {
      url: pathToFileURL(resolveZodPath()).href,
      shortCircuit: true,
    };
  }
  return defaultResolve(specifier, context, defaultResolve);
}

