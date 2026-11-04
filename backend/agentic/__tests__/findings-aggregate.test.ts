import { aggregateRunFindings } from '../index';
import type { Finding } from '../../../models/agentic-findings';

function run(Artikel_Nummer: string, Status: string, SubCategory: number | null, findings: Finding[]) {
  return { Artikel_Nummer, Status, SubCategory, FindingsJson: JSON.stringify(findings) };
}
const missing = (field: string, severity: Finding['severity'] = 'block'): Finding =>
  ({ type: 'missing_required', severity, field, message: `${field} fehlt`, ask: 'fix' });

describe('aggregateRunFindings — cockpit findings aggregation (increment 2)', () => {
  it('counts the status distribution in canonical pipeline order', () => {
    const agg = aggregateRunFindings([
      run('a', 'approved', 701, []),
      run('b', 'review', 701, []),
      run('c', 'approved', 701, []),
      run('d', 'notStarted', null, [])
    ]);
    expect(agg.totalRuns).toBe(4);
    // notStarted before review before approved (canonical order), regardless of insertion order.
    expect(agg.statusDistribution.map((s) => s.status)).toEqual(['notStarted', 'review', 'approved']);
    expect(agg.statusDistribution.find((s) => s.status === 'approved')?.count).toBe(2);
  });

  it('groups findings into clusters by type × field × subcategory, worst-first', () => {
    const agg = aggregateRunFindings([
      run('a', 'review', 701, [missing('Speicher')]),
      run('b', 'review', 701, [missing('Speicher')]),
      run('c', 'review', 701, [{ type: 'banned_phrase', severity: 'warn', field: 'Artikelbeschreibung', message: 'x', ask: 'fix' }]),
      run('d', 'review', 300, [missing('Speicher')])
    ]);
    // Speicher@701 (block, count 2) sorts before banned_phrase (warn) and Speicher@300 (block, count 1).
    const first = agg.clusters[0];
    expect(first.type).toBe('missing_required');
    expect(first.field).toBe('Speicher');
    expect(first.subCategory).toBe(701);
    expect(first.count).toBe(2);
    expect(first.sample).toEqual(['a', 'b']);
    // three distinct classes (Speicher@701, banned@701, Speicher@300)
    expect(agg.totalClusters).toBe(3);
  });

  it('counts each item once per severity it carries, not once per finding', () => {
    const agg = aggregateRunFindings([
      run('a', 'review', 701, [missing('Speicher'), missing('Speichertyp')]) // two block findings, one item
    ]);
    expect(agg.itemsBySeverity.block).toBe(1);
  });

  it('respects the cluster cap but still reports the true total', () => {
    const rows = Array.from({ length: 5 }, (_, i) => run(`a${i}`, 'review', 700 + i, [missing('Speicher')]));
    const agg = aggregateRunFindings(rows, 2);
    expect(agg.clusters).toHaveLength(2);
    expect(agg.totalClusters).toBe(5);
  });

  it('tolerates malformed or empty findings JSON', () => {
    const agg = aggregateRunFindings([
      { Artikel_Nummer: 'a', Status: 'review', SubCategory: 701, FindingsJson: 'not json' },
      { Artikel_Nummer: 'b', Status: 'approved', SubCategory: 701, FindingsJson: null }
    ]);
    expect(agg.totalRuns).toBe(2);
    expect(agg.clusters).toHaveLength(0);
    expect(agg.itemsBySeverity.block).toBe(0);
  });
});
