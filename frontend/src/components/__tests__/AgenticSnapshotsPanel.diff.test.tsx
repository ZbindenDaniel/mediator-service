import { computeSnapshotDiff } from '../AgenticSnapshotsPanel';

describe('computeSnapshotDiff', () => {
  it('returns no entries when nothing changed', () => {
    const fields = { Artikelbeschreibung: 'Laptop Dell', Langtext: { RAM: '8GB' } };
    expect(computeSnapshotDiff(fields, fields)).toEqual([]);
  });

  it('detects a changed top-level field', () => {
    const diff = computeSnapshotDiff(
      { Artikelbeschreibung: 'Laptop Dell' },
      { Artikelbeschreibung: 'Laptop Dell Latitude 5400' }
    );
    expect(diff).toHaveLength(1);
    expect(diff[0]).toMatchObject({
      field: 'Artikelbeschreibung',
      before: 'Laptop Dell',
      after: 'Laptop Dell Latitude 5400',
      kind: 'changed'
    });
  });

  it('classifies added and removed fields', () => {
    const added = computeSnapshotDiff({ Hersteller: null }, { Hersteller: 'Dell' });
    expect(added[0]).toMatchObject({ field: 'Hersteller', kind: 'added' });

    const removed = computeSnapshotDiff({ Kurzbeschreibung: 'text' }, { Kurzbeschreibung: '' });
    expect(removed[0]).toMatchObject({ field: 'Kurzbeschreibung', kind: 'removed' });
  });

  it('diffs Langtext key-by-key', () => {
    const diff = computeSnapshotDiff(
      { Langtext: { RAM: '8GB', SSD: '256GB' } },
      { Langtext: { RAM: '16GB', SSD: '256GB', OS: 'Linux' } }
    );
    const fields = diff.map((d) => d.field).sort();
    expect(fields).toEqual(['Langtext · OS', 'Langtext · RAM']);
    const ram = diff.find((d) => d.field === 'Langtext · RAM');
    expect(ram).toMatchObject({ before: '8GB', after: '16GB', kind: 'changed' });
    const os = diff.find((d) => d.field === 'Langtext · OS');
    expect(os).toMatchObject({ before: '', after: 'Linux', kind: 'added' });
  });

  it('renders array spec values as comma-joined strings', () => {
    const diff = computeSnapshotDiff(
      { Langtext: { Anschlüsse: ['USB', 'HDMI'] } },
      { Langtext: { Anschlüsse: ['USB', 'HDMI', 'USB-C'] } }
    );
    expect(diff[0]).toMatchObject({ before: 'USB, HDMI', after: 'USB, HDMI, USB-C', kind: 'changed' });
  });

  it('tolerates null/undefined snapshots', () => {
    expect(computeSnapshotDiff(null, null)).toEqual([]);
    expect(computeSnapshotDiff(undefined, { Hersteller: 'HP' })).toHaveLength(1);
  });
});
