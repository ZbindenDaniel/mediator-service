import {
  applyReferenceEditsAfterReview,
  normalizeReferenceEditsPayload
} from '../agentic-status';
import type { ItemRef } from '../../../models';

const silentLogger = { debug: () => {}, error: () => {}, info: () => {}, warn: () => {} };

describe('normalizeReferenceEditsPayload', () => {
  it('keeps only whitelisted, non-empty, trimmed fields', () => {
    const result = normalizeReferenceEditsPayload({
      Artikelbeschreibung: '  Festplatte 2TB  ',
      Kurzbeschreibung: 'Kurz.',
      Verkaufspreis: 99, // not whitelisted
      Hersteller: 'ACME', // not whitelisted
      notAField: 'x'
    });

    expect(result).toEqual({ Artikelbeschreibung: 'Festplatte 2TB', Kurzbeschreibung: 'Kurz.' });
  });

  it('drops empty / whitespace-only values and non-strings', () => {
    expect(normalizeReferenceEditsPayload({ Artikelbeschreibung: '   ', Kurzbeschreibung: 42 })).toEqual({});
    expect(normalizeReferenceEditsPayload(null)).toEqual({});
    expect(normalizeReferenceEditsPayload('nope')).toEqual({});
    expect(normalizeReferenceEditsPayload(['Artikelbeschreibung'])).toEqual({});
  });

  it('parses numeric dimension fields (comma decimals) and drops unparseable/negative ones', () => {
    expect(normalizeReferenceEditsPayload({
      'Länge_mm': '147',
      'Breite_mm': '101,6',
      'Höhe_mm': 'abc',
      'Gewicht_kg': '-1'
    })).toEqual({ 'Länge_mm': '147', 'Breite_mm': '101.6' });
  });
});

describe('applyReferenceEditsAfterReview', () => {
  it('persists whitelisted edits onto the existing reference', async () => {
    const reference: ItemRef = { Artikel_Nummer: 'R-1', Artikelbeschreibung: 'Alt', Kurzbeschreibung: 'Alt kurz' };
    const persistItemReference = jest.fn(async () => undefined);
    const getItemReference = jest.fn(async () => reference);

    await applyReferenceEditsAfterReview(
      'R-1',
      { Artikelbeschreibung: 'Festplatte 2TB', Kurzbeschreibung: 'Kurz.' },
      { getItemReference, persistItemReference },
      silentLogger
    );

    expect(persistItemReference).toHaveBeenCalledTimes(1);
    expect(persistItemReference).toHaveBeenCalledWith(
      expect.objectContaining({
        Artikel_Nummer: 'R-1',
        Artikelbeschreibung: 'Festplatte 2TB',
        Kurzbeschreibung: 'Kurz.'
      })
    );
  });

  it('coerces numeric dimension edits to numbers on persist', async () => {
    const reference: ItemRef = { Artikel_Nummer: 'R-1', 'Länge_mm': 10 };
    const persistItemReference = jest.fn(async () => undefined);
    const getItemReference = jest.fn(async () => reference);

    await applyReferenceEditsAfterReview(
      'R-1',
      { 'Länge_mm': '147', 'Höhe_mm': '26', Artikelbeschreibung: 'Festplatte 3.5"' },
      { getItemReference, persistItemReference },
      silentLogger
    );

    const persisted = persistItemReference.mock.calls[0][0] as ItemRef;
    expect(persisted['Länge_mm']).toBe(147);
    expect(persisted['Höhe_mm']).toBe(26);
    expect(persisted.Artikelbeschreibung).toBe('Festplatte 3.5"');
  });

  it('is a no-op when there are no valid edits', async () => {
    const persistItemReference = jest.fn(async () => undefined);
    const getItemReference = jest.fn(async () => ({ Artikel_Nummer: 'R-1' }) as ItemRef);

    await applyReferenceEditsAfterReview('R-1', {}, { getItemReference, persistItemReference }, silentLogger);

    expect(getItemReference).not.toHaveBeenCalled();
    expect(persistItemReference).not.toHaveBeenCalled();
  });

  it('does not persist when the reference cannot be found', async () => {
    const persistItemReference = jest.fn(async () => undefined);
    const getItemReference = jest.fn(async () => undefined);

    await applyReferenceEditsAfterReview(
      'R-missing',
      { Artikelbeschreibung: 'Neu' },
      { getItemReference, persistItemReference },
      silentLogger
    );

    expect(persistItemReference).not.toHaveBeenCalled();
  });
});
