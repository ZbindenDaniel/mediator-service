import path from 'path';
import { assertPathWithinRoot, resolvePathWithinRoot } from '../lib/path-guard';

describe('path-guard', () => {
  it('resolves a safe child path within root', () => {
    const root = path.resolve('/tmp/root');
    const resolved = resolvePathWithinRoot(root, 'child/file.txt');
    expect(resolved).toBe(path.resolve(root, 'child/file.txt'));
  });

  it('rejects traversal attempt', () => {
    const root = path.resolve('/tmp/root');
    const resolved = resolvePathWithinRoot(root, '../escape.txt');
    expect(resolved).toBeNull();
  });

  it('rejects sibling prefix collision (/root vs /root2)', () => {
    const root = path.resolve('/tmp/root');
    const resolved = resolvePathWithinRoot(root, '/tmp/root2/asset.png');
    expect(resolved).toBeNull();
  });

  it('rejects absolute external path', () => {
    const root = path.resolve('/tmp/root');
    expect(() =>
      assertPathWithinRoot(root, path.resolve('/var/tmp/external.txt'), {
        operation: 'test:external-assert'
      })
    ).toThrow('Path is outside allowed root');
  });
});
