import { buildManualSubmissionPayload, MANUAL_CREATION_LOCKS } from '../frontend/src/components/ItemCreate';
import type { ItemFormData } from '../frontend/src/components/forms/itemFormShared';

describe('manual item creation helpers', () => {
  test('retains manually entered quantity when building submission payload', () => {
    const basicInfo: Partial<ItemFormData> = {
      Artikelbeschreibung: 'Basis',
      Artikel_Nummer: 'BASE-1',
      Auf_Lager: 1,
      BoxID: 'BOX-1'
    };
    const manualData: Partial<ItemFormData> = {
      Artikelbeschreibung: 'Manuell',
      Artikel_Nummer: 'MAN-1',
      Auf_Lager: 5
    };

    const payload = buildManualSubmissionPayload({
      basicInfo,
      manualData,
      fallbackBoxId: 'BOX-FALLBACK'
    });

    expect(payload.Auf_Lager).toBe(5);
    expect(payload.BoxID).toBe('BOX-1');
  });

  test('falls back to basic info quantity when manual data omits it', () => {
    const basicInfo: Partial<ItemFormData> = {
      Artikelbeschreibung: 'Basis',
      Artikel_Nummer: 'BASE-2',
      Auf_Lager: 3,
      BoxID: undefined
    };
    const manualData: Partial<ItemFormData> = {
      Artikelbeschreibung: 'Override Beschreibung'
    };

    const payload = buildManualSubmissionPayload({
      basicInfo,
      manualData,
      fallbackBoxId: 'BOX-FALLBACK'
    });

    expect(payload.Auf_Lager).toBe(3);
    expect(payload.BoxID).toBe('BOX-FALLBACK');
  });

  test('does not lock quantity field in manual creation configuration', () => {
    expect(MANUAL_CREATION_LOCKS.Auf_Lager).toBeUndefined();
  });
});
