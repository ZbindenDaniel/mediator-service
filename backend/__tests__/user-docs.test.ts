import fs from 'fs';
import path from 'path';
import {
  compareDocNames,
  filterDocSections,
  hasBalancedDocSections,
  isDocPageEnabled,
  listUnknownDocFeatureKeys
} from '../lib/userDocs';
import type { FeatureKey } from '../lib/features';

const allOn = () => true;
const onlyOff = (...off: FeatureKey[]) => (key: FeatureKey) => !off.includes(key);

describe('user docs feature gating', () => {
  it('hides a page whose page-level feature is off', () => {
    const md = '# KI-Cockpit\n<!-- feature: agentic -->\n\nText';
    expect(isDocPageEnabled(md, allOn)).toBe(true);
    expect(isDocPageEnabled(md, onlyOff('agentic'))).toBe(false);
    expect(isDocPageEnabled('# Ohne Marker', onlyOff('agentic'))).toBe(true);
  });

  it('strips sections of disabled features and all marker lines', () => {
    const md = [
      '# Seite',
      '<!-- feature: logs -->',
      'immer',
      '<!-- if-feature: stubs -->',
      'nur mit stubs',
      '<!-- end-feature -->',
      '<!-- if-feature: agentic -->',
      'nur mit KI',
      '<!-- end-feature -->'
    ].join('\n');
    const out = filterDocSections(md, onlyOff('agentic'));
    expect(out).toContain('nur mit stubs');
    expect(out).not.toContain('nur mit KI');
    expect(out).not.toContain('<!--');
  });

  it('keeps table rows contiguous after removing gated rows', () => {
    const md = '| A | B |\n|---|---|\n| 1 | x |\n<!-- if-feature: stubs -->\n| 2 | y |\n<!-- end-feature -->\n| 3 | z |';
    expect(filterDocSections(md, onlyOff('stubs'))).toBe('| A | B |\n|---|---|\n| 1 | x |\n| 3 | z |');
  });

  it('hides nested sections when the outer feature is off', () => {
    const md = '<!-- if-feature: agentic -->\na\n<!-- if-feature: logs -->\nb\n<!-- end-feature -->\nc\n<!-- end-feature -->\nd';
    expect(filterDocSections(md, onlyOff('agentic')).trim()).toBe('d');
    expect(filterDocSections(md, onlyOff('logs')).trim()).toBe('a\nc\nd');
  });

  it('requires every listed key and treats unknown keys as off', () => {
    const md = '<!-- if-feature: stubs, logs -->\nx\n<!-- end-feature -->\n<!-- if-feature: typo-key -->\ny\n<!-- end-feature -->';
    expect(filterDocSections(md, onlyOff('logs'))).not.toContain('x');
    expect(filterDocSections(md, allOn)).not.toContain('y');
    expect(listUnknownDocFeatureKeys(md)).toEqual(['typo-key']);
  });

  it('sorts by numeric prefix so 10_ follows 9_', () => {
    expect(['10_KI-Cockpit.md', '2_Fehlerbehebung.md', '9_Aktivitaeten.md'].sort(compareDocNames))
      .toEqual(['2_Fehlerbehebung.md', '9_Aktivitaeten.md', '10_KI-Cockpit.md']);
  });
});

describe('docs/user markers', () => {
  const dir = path.join(__dirname, '../../docs/user');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md');

  // Plain loop, not it.each: the repo's test harness (scripts/run-tests.js) doesn't provide it.each.
  for (const file of files) {
    it(`${file} uses only known feature keys and balanced sections`, () => {
      const md = fs.readFileSync(path.join(dir, file), 'utf8');
      expect(listUnknownDocFeatureKeys(md)).toEqual([]);
      expect(hasBalancedDocSections(md)).toBe(true);
      // Inline markers are not supported (line-based filter) — they must sit on their own line.
      for (const line of md.split('\n')) {
        if (line.includes('<!--')) expect(/^<!--.*-->$/.test(line.trim())).toBe(true);
      }
    });
  }

  it('every page still starts with its title when all features are off', () => {
    for (const file of files) {
      const md = fs.readFileSync(path.join(dir, file), 'utf8');
      expect(filterDocSections(md, () => false).startsWith('# ')).toBe(true);
    }
  });
});
