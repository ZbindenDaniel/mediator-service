const fs = require('fs');
const path = require('path');
const { describe, test, beforeEach, afterAll, expect } = require('../../test/harness');
const { resolvePublicDir } = require('../../dist/backend/publicResolver.js');

const tmp = path.join(__dirname, '__tmp_public_test');
const dist = path.join(tmp, 'dist_public');
const repo = path.join(tmp, 'repo_public');

function setup() {
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(dist, { recursive: true });
  fs.mkdirSync(repo, { recursive: true });
}

describe('resolvePublicDir', () => {
  beforeEach(() => setup());
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  test('prefers dist when index.html exists', () => {
    fs.writeFileSync(path.join(dist, 'index.html'), '<html></html>');
    const r = resolvePublicDir(dist, repo);
    expect(r).toBe(dist);
  });

  test('falls back to repo when dist missing', () => {
    fs.writeFileSync(path.join(repo, 'index.html'), '<html></html>');
    const r = resolvePublicDir(dist, repo);
    expect(r).toBe(repo);
  });

  test('returns dist when neither exists', () => {
    const r = resolvePublicDir(dist, repo);
    expect(r).toBe(dist);
  });
});
