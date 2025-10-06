// import { buildStockConfirmOptions } from '../frontend/src/components/forms/itemFormShared';
// import { dialogService } from '../frontend/src/components/dialog';

// describe('item form stock confirmation helper', () => {
//   afterEach(() => {
//     jest.restoreAllMocks();
//   });

//   test('builds confirmation options for adding stock', () => {
//     const options = buildStockConfirmOptions('add');

//     expect(options.title).toBe('Bestandsänderung bestätigen');
//     expect(options.message).toBe('Bestand erhöhen?');
//     expect(options.confirmLabel).toBe('Erhöhen');
//     expect(options.cancelLabel).toBe('Abbrechen');
//   });

//   test('builds confirmation options for removing stock', () => {
//     const options = buildStockConfirmOptions('remove');

//     expect(options.title).toBe('Bestandsänderung bestätigen');
//     expect(options.message).toBe('Bestand verringern?');
//     expect(options.confirmLabel).toBe('Verringern');
//     expect(options.cancelLabel).toBe('Abbrechen');
//   });

//   test('allows mocking the dialog confirm helper for stock changes', async () => {
//     const confirmSpy = jest.spyOn(dialogService, 'confirm').mockResolvedValue(true);

//     const options = buildStockConfirmOptions('add');
//     const result = await confirmSpy(options);

//     expect(confirmSpy).toHaveBeenCalledWith({
//       title: 'Bestandsänderung bestätigen',
//       message: 'Bestand erhöhen?',
//       confirmLabel: 'Erhöhen',
//       cancelLabel: 'Abbrechen'
//     });
//     expect(result).toBe(true);
//   });
// });
