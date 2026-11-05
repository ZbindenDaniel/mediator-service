import { buildTargetFromRow } from '../invoker';

// Regression: buildTargetFromRow MUST carry the item's category onto the run target. Without it, the flow
// resolves subcategoryCode = null → no spec contract → SpecContractVersion stamps null and
// computeReferenceDataQuality returns null. That caused two production bugs:
//   (1) a rework/validate-only item could never become non-stale → the self-heal sweep looped on it
//       forever (one item burned millions of tokens);
//   (2) a complete, clean validate-only item graded null at the auto-approve gate → sent to review
//       despite reading grade 5/5 on the stored ref.
describe('buildTargetFromRow — carries the stored category onto the run target', () => {
  it('includes Unterkategorien_A (and the other category codes) coerced to a number', () => {
    const t = buildTargetFromRow({
      Artikel_Nummer: '019439',
      Artikelbeschreibung: 'Adaptec AAR-1420SA HostRAID-Controller',
      Unterkategorien_A: '701',
      Hauptkategorien_A: '70',
      Langtext: { 'PCI-Interface': 'PCI-X' }
    });
    expect(t.Unterkategorien_A).toBe(701);
    expect(t.Hauptkategorien_A).toBe(70);
    expect(typeof t.Unterkategorien_A).toBe('number');
  });

  it('carries a numeric category through unchanged and leaves a missing one null', () => {
    const t = buildTargetFromRow({ Artikel_Nummer: 'x', Unterkategorien_A: 201 });
    expect(t.Unterkategorien_A).toBe(201);
    const t2 = buildTargetFromRow({ Artikel_Nummer: 'y' });
    expect(t2.Unterkategorien_A).toBeNull();
  });
});
