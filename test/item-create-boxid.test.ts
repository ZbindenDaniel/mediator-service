import {
  buildCreationParams,
  buildManualSubmissionPayload,
  mergeManualDraftForFallback
} from '../frontend/src/components/ItemCreate';
import type { ItemFormData } from '../frontend/src/components/forms/itemFormShared';

describe('ItemCreate box handling', () => {
  it('preserves a prefilled BoxID when building manual submission payloads', () => {
    const basicInfo: Partial<ItemFormData> = {
      Artikelbeschreibung: 'Basisartikel',
      BoxID: 'BOX-ORIGIN'
    };
    const manualData: Partial<ItemFormData> = {
      Artikelbeschreibung: 'Überschrieben',
      BoxID: 'BOX-MANUAL'
    };

    const payload = buildManualSubmissionPayload({
      basicInfo,
      manualData
    });

    expect(payload.BoxID).toBe('BOX-MANUAL');
    expect(payload.agenticManualFallback).toBe(true);
    expect(payload.agenticStatus).toBe('notStarted');
  });

  it('falls back to basic info BoxID when manual data omits it', () => {
    const basicInfo: Partial<ItemFormData> = {
      Artikelbeschreibung: 'Basisartikel',
      BoxID: 'BOX-BASIC'
    };
    const manualData: Partial<ItemFormData> = {
      Artikelbeschreibung: 'Manuelle Beschreibung'
    };

    const payload = buildManualSubmissionPayload({
      basicInfo,
      manualData
    });

    expect(payload.BoxID).toBe('BOX-BASIC');
  });

  it('retains BoxID data when merging manual drafts after an agentic fallback', () => {
    const previousManual: Partial<ItemFormData> = {
      BoxID: ' BOX-EXISTING '
    };
    const baseDraft: Partial<ItemFormData> = {
      BoxID: 'BOX-BASE'
    };
    const agenticData: Partial<ItemFormData> = {
      Artikelbeschreibung: 'Agentic'
    };

    const merged = mergeManualDraftForFallback({
      previousManualDraft: previousManual,
      baseDraft,
      agenticData
    });

    expect(merged.BoxID).toBe('BOX-BASE');
    expect(merged.agenticManualFallback).toBe(true);
    expect(merged.agenticStatus).toBe('notStarted');
  });

  it('includes a normalized BoxID in the creation payload parameters', () => {
    const params = buildCreationParams(
      {
        Artikelbeschreibung: 'Payload Test',
        BoxID: '  BOX-123  ',
        Auf_Lager: 1
      },
      { removeItemUUID: true },
      'tester'
    );

    expect(params.get('BoxID')).toBe('BOX-123');
  });
});

