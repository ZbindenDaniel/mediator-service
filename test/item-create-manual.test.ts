// import {
//   buildManualSubmissionPayload,
//   MANUAL_CREATION_LOCKS,
//   mergeManualDraftForFallback
// } from '../frontend/src/components/ItemCreate';
// import type { ItemFormData } from '../frontend/src/components/forms/itemFormShared';

// describe('manual item creation helpers', () => {
//   test('retains manually entered quantity when building submission payload', () => {
//     const basicInfo: Partial<ItemFormData> = {
//       Artikelbeschreibung: 'Basis',
//       Artikel_Nummer: 'BASE-1',
//       Auf_Lager: 1,
//       BoxID: 'BOX-1'
//     };
//     const manualData: Partial<ItemFormData> = {
//       Artikelbeschreibung: 'Manuell',
//       Artikel_Nummer: 'MAN-1',
//       Auf_Lager: 5
//     };

//     const payload = buildManualSubmissionPayload({
//       basicInfo,
//       manualData,
//       fallbackBoxId: 'BOX-FALLBACK'
//     });

//     expect(payload.Auf_Lager).toBe(5);
//     expect(payload.BoxID).toBe('BOX-1');
//   });

//   test('falls back to basic info quantity when manual data omits it', () => {
//     const basicInfo: Partial<ItemFormData> = {
//       Artikelbeschreibung: 'Basis',
//       Artikel_Nummer: 'BASE-2',
//       Auf_Lager: 3,
//       BoxID: undefined
//     };
//     const manualData: Partial<ItemFormData> = {
//       Artikelbeschreibung: 'Override Beschreibung'
//     };

//     const payload = buildManualSubmissionPayload({
//       basicInfo,
//       manualData,
//       fallbackBoxId: 'BOX-FALLBACK'
//     });

//     expect(payload.Auf_Lager).toBe(3);
//     expect(payload.BoxID).toBe('BOX-FALLBACK');
//   });

//   test('does not lock quantity field in manual creation configuration', () => {
//     expect(MANUAL_CREATION_LOCKS.Auf_Lager).toBeUndefined();
//   });

//   test('mergeManualDraftForFallback merges agentic data and clears identifiers', () => {
//     const previousManual = {
//       Auf_Lager: 2,
//       BoxID: 'BOX-EXISTING',
//       ItemUUID: 'should-be-removed',
//       agenticStatus: 'queued'
//     } as Partial<ItemFormData>;
//     const baseDraft = {
//       Artikelbeschreibung: 'Basisbeschreibung',
//       BoxID: 'BOX-BASE'
//     };
//     const agenticData: Partial<ItemFormData> = {
//       Artikelbeschreibung: 'Agentic Beschreibung',
//       Artikel_Nummer: 'AG-42',
//       picture1: 'photo-data',
//       agenticSearch: 'search-term'
//     };

//     const merged = mergeManualDraftForFallback({
//       previousManualDraft: previousManual,
//       baseDraft,
//       agenticData
//     });

//     expect(merged).toMatchObject({
//       Artikelbeschreibung: 'Agentic Beschreibung',
//       Artikel_Nummer: 'AG-42',
//       BoxID: 'BOX-BASE',
//       Auf_Lager: 2,
//       picture1: 'photo-data'
//     });
//     expect(merged.ItemUUID).toBeUndefined();
//     expect(merged.agenticStatus).toBeUndefined();
//     expect(merged.agenticSearch).toBeUndefined();
//   });

//   test('mergeManualDraftForFallback ignores undefined agentic values to preserve manual input', () => {
//     const previousManual: Partial<ItemFormData> = {
//       Kurzbeschreibung: 'Manual Kurz',
//       Auf_Lager: 1
//     };
//     const baseDraft: Partial<ItemFormData> = {
//       Kurzbeschreibung: 'Base Kurz',
//       Auf_Lager: 4
//     };
//     const agenticData: Partial<ItemFormData> = {
//       Kurzbeschreibung: undefined,
//       Auf_Lager: undefined
//     };

//     const merged = mergeManualDraftForFallback({
//       previousManualDraft: previousManual,
//       baseDraft,
//       agenticData
//     });

//     expect(merged.Kurzbeschreibung).toBe('Base Kurz');
//     expect(merged.Auf_Lager).toBe(4);
//   });
// });
