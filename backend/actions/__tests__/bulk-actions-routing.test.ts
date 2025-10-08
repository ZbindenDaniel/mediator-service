const fs = require('fs');
const path = require('path');

function loadMatches(relativeFile) {
  const fullPath = path.join(__dirname, '..', relativeFile);
  const source = fs.readFileSync(fullPath, 'utf8');
  const match = source.match(/matches:\s*\(path,\s*method\)\s*=>\s*([^,\n]+)/);
  if (!match) {
    throw new Error(`matches function not found in ${relativeFile}`);
  }
  const expression = match[1];
  return new Function('path', 'method', `return (${expression});`);
}

describe('bulk action route matching', () => {
  const moveMatches = loadMatches('bulk-move-items.ts');
  const deleteMatches = loadMatches('bulk-delete-items.ts');

  it('matches POST requests for bulk move', () => {
    expect(moveMatches('/api/items/bulk/move', 'POST')).toBe(true);
  });

  it('does not match other verbs for bulk move', () => {
    expect(moveMatches('/api/items/bulk/move', 'GET')).toBe(false);
    expect(moveMatches('/api/items/bulk/move', 'DELETE')).toBe(false);
  });

  it('matches POST requests for bulk delete', () => {
    expect(deleteMatches('/api/items/bulk/delete', 'POST')).toBe(true);
  });

  it('does not match other verbs for bulk delete', () => {
    expect(deleteMatches('/api/items/bulk/delete', 'GET')).toBe(false);
    expect(deleteMatches('/api/items/bulk/delete', 'PATCH')).toBe(false);
  });
});

