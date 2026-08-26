import { condenseSearchText } from '../utils/search-condense';

describe('condenseSearchText', () => {
  it('returns small inputs verbatim (no condensation under budget)', () => {
    const raw = 'Modell ZX-9000 Preis 49,99 EUR\nGewicht 5 kg';
    const result = condenseSearchText(raw, { maxLength: 12000 });
    expect(result.condensed).toBe(false);
    expect(result.text).toBe(raw);
  });

  it('condenses an oversized blob to within the budget', () => {
    const noise = Array.from({ length: 2000 }, (_, i) =>
      `Willkommen auf unserer Seite Abschnitt ${i} — Newsletter anmelden und mehr erfahren`
    ).join('\n');
    const raw = `Modell AB-1200 Preis 199,00 EUR\nGewicht 5 kg Leistung 220 W\n${noise}`;
    const result = condenseSearchText(raw, { maxLength: 500 });
    expect(result.condensed).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(500);
    expect(result.originalLength).toBeGreaterThan(500);
  });

  it('prioritises spec-bearing lines over boilerplate when trimming', () => {
    const boilerplate = Array.from({ length: 50 }, (_, i) =>
      `Kontaktieren Sie uns fuer weitere Informationen Abschnitt ${i}`
    ).join('\n');
    // Put the spec line LAST so a naive head-truncation would drop it; the condenser must keep it.
    const raw = `${boilerplate}\nModell QX-4400 16 GB RAM 512 GB SSD Preis 899 EUR`;
    const result = condenseSearchText(raw, { maxLength: 200 });
    expect(result.text).toContain('QX-4400');
    expect(result.specLineCount).toBeGreaterThan(0);
  });

  it('dedupes repeated lines', () => {
    const raw = `${'Modell ZZ-1 Preis 10 EUR\n'.repeat(400)}Gewicht 2 kg`;
    const result = condenseSearchText(raw, { maxLength: 300 });
    const occurrences = result.text.split('Modell ZZ-1 Preis 10 EUR').length - 1;
    expect(occurrences).toBe(1);
  });

  it('never exceeds the budget even for a single oversized line', () => {
    const raw = `Preis ${'9'.repeat(5000)} EUR`;
    const result = condenseSearchText(raw, { maxLength: 100 });
    expect(result.text.length).toBeLessThanOrEqual(100);
    // ...and not dropped to nothing — an oversized single line still carries signal.
    expect(result.text.length).toBeGreaterThan(0);
  });
});
