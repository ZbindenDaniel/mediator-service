// TODO(agent): Extend this script to read NOTICE files when dependencies declare them.
const fs = require('fs');
const path = require('path');

const LOCKFILE_PATH = path.join(__dirname, '..', 'package-lock.json');
const OUTPUT_PATH = path.join(__dirname, '..', 'docs', 'license-inventory.json');

function loadLockfile(filePath) {
  try {
    const rawContent = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(rawContent);
  } catch (error) {
    console.error('Unable to read or parse the lockfile:', { filePath, error });
    throw error;
  }
}

function normaliseName(packagePath, meta) {
  if (meta && meta.name) {
    return meta.name;
  }

  const segments = packagePath.split('node_modules/');
  return segments[segments.length - 1] || packagePath;
}

function extractInventory(lockfile) {
  const packages = lockfile.packages || {};
  const seen = new Set();

  return Object.entries(packages)
    .filter(([packagePath]) => packagePath)
    .map(([packagePath, meta]) => {
      const name = normaliseName(packagePath, meta);
      const version = meta.version || 'UNKNOWN';
      const license = meta.license || 'UNKNOWN';
      const key = `${name}@${version}`;

      if (seen.has(key)) {
        return null;
      }

      seen.add(key);
      return {
        name,
        version,
        license,
        resolved: meta.resolved || 'unresolved',
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function writeOutput(records, destination) {
  try {
    const serialised = JSON.stringify(records, null, 2);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, `${serialised}\n`, 'utf-8');
    console.info(`Wrote license inventory to ${destination}`);
  } catch (error) {
    console.error('Failed to write license inventory:', { destination, error });
    throw error;
  }
}

function main() {
  try {
    console.info('Building license inventory from package-lock.json');
    const lockfile = loadLockfile(LOCKFILE_PATH);
    const inventory = extractInventory(lockfile);
    writeOutput(inventory, OUTPUT_PATH);
    console.info(`Captured ${inventory.length} dependencies.`);
  } catch (error) {
    console.error('Failed to build license inventory.', error);
    process.exitCode = 1;
  }
}

main();
