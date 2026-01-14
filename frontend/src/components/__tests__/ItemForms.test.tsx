// /** @jest-environment jsdom */

// import React from 'react';
// import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
// import ItemForm from '../ItemForm';

// function createFileList(...files: File[]): FileList {
//   const fileList: Partial<FileList> & { [index: number]: File } = {
//     length: files.length,
//     item: (index: number) => files[index] ?? null
//   };
//   files.forEach((file, index) => {
//     fileList[index] = file;
//   });
//   return fileList as FileList;
// }

// describe('Item forms', () => {
//   let reportValiditySpy: jest.SpyInstance;
//   const originalFetch = global.fetch;
//   const originalMediaDevices = navigator.mediaDevices;
//   const originalCanvasGetContext = HTMLCanvasElement.prototype.getContext;
//   const originalCanvasToDataUrl = HTMLCanvasElement.prototype.toDataURL;

//   beforeEach(() => {
//     cleanup();
//     reportValiditySpy = jest.spyOn(HTMLFormElement.prototype, 'reportValidity').mockReturnValue(true);
//     global.fetch = jest.fn().mockResolvedValue({
//       ok: true,
//       json: async () => ({ items: [] })
//     });

//     class MockFileReader {
//       public result: string | ArrayBuffer | null = null;
//       public onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null;
//       public onerror: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null;

//       readAsDataURL(file: Blob) {
//         this.result = `data:${file.type};base64,TEST`;
//         if (this.onload) {
//           this.onload.call(this as unknown as FileReader, new ProgressEvent('load'));
//         }
//       }
//     }

//     // @ts-expect-error - override for tests
//     global.FileReader = MockFileReader;

//     Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, value: 640 });
//     Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, value: 480 });
//     HTMLCanvasElement.prototype.getContext = jest.fn(() => ({ drawImage: jest.fn() })) as typeof originalCanvasGetContext;
//     HTMLCanvasElement.prototype.toDataURL = jest.fn(() => 'data:image/png;base64,CAPTURE') as typeof originalCanvasToDataUrl;
//   });

//   afterEach(() => {
//     cleanup();
//     reportValiditySpy.mockRestore();
//     jest.restoreAllMocks();
//     global.fetch = originalFetch;
//     Object.defineProperty(navigator, 'mediaDevices', {
//       configurable: true,
//       value: originalMediaDevices
//     });
//     HTMLCanvasElement.prototype.getContext = originalCanvasGetContext;
//     HTMLCanvasElement.prototype.toDataURL = originalCanvasToDataUrl;
//   });

//   it('submits new item data with captured photo', async () => {
//     const onSubmit = jest.fn().mockResolvedValue(undefined);
//     const mockStream = {
//       getTracks: () => [{ stop: jest.fn() }]
//     } as unknown as MediaStream;

//     Object.defineProperty(navigator, 'mediaDevices', {
//       configurable: true,
//       value: {
//         getUserMedia: jest.fn().mockResolvedValue(mockStream)
//       }
//     });

//     render(
//       <ItemForm
//         item={{ BoxID: 'BOX-7' }}
//         isNew
//         submitLabel="Speichern"
//         onSubmit={onSubmit}
//       />
//     );

//     fireEvent.change(screen.getByLabelText('Artikelbeschreibung*'), { target: { value: 'Test Item' } });
//     fireEvent.change(screen.getByLabelText('Artikelnummer*'), { target: { value: 'MAT-123' } });
//     fireEvent.change(screen.getByLabelText('Anzahl*'), { target: { value: '3' } });

//     fireEvent.click(screen.getByRole('button', { name: 'Kamera öffnen' }));

//     await act(async () => {
//       await Promise.resolve();
//     });

//     fireEvent.click(screen.getByRole('button', { name: 'Capture' }));

//     fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
//     await Promise.resolve();

//     expect(onSubmit).toHaveBeenCalledTimes(1);
//     expect(onSubmit.mock.calls[0][0]).toEqual(
//       expect.objectContaining({
//         Artikelbeschreibung: 'Test Item',
//         Artikel_Nummer: 'MAT-123',
//         Auf_Lager: 3,
//         picture1: 'data:image/png;base64,CAPTURE'
//       })
//     );
//     expect((navigator.mediaDevices.getUserMedia as jest.Mock).mock.calls[0][0]).toEqual({ video: true });
//   });

//   it('submits new item data with file input photo', async () => {
//     const onSubmit = jest.fn().mockResolvedValue(undefined);
//     Object.defineProperty(navigator, 'mediaDevices', {
//       configurable: true,
//       value: undefined
//     });

//     render(
//       <ItemForm
//         item={{ BoxID: 'BOX-7' }}
//         isNew
//         submitLabel="Speichern"
//         onSubmit={onSubmit}
//       />
//     );

//     fireEvent.change(screen.getByLabelText('Artikelbeschreibung*'), { target: { value: 'Test Item' } });
//     fireEvent.change(screen.getByLabelText('Artikelnummer*'), { target: { value: 'MAT-123' } });
//     fireEvent.change(screen.getByLabelText('Anzahl*'), { target: { value: '3' } });

//     const file = new File(['binary'], 'photo.png', { type: 'image/png' });
//     const files = createFileList(file);
//     fireEvent.change(screen.getByLabelText('Foto 1*'), { target: { files } });

//     fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
//     await Promise.resolve();

//     expect(onSubmit).toHaveBeenCalledTimes(1);
//     expect(onSubmit.mock.calls[0][0]).toEqual(
//       expect.objectContaining({
//         Artikelbeschreibung: 'Test Item',
//         Artikel_Nummer: 'MAT-123',
//         Auf_Lager: 3,
//         picture1: expect.stringContaining('data:image/png;base64,TEST')
//       })
//     );
//     expect(screen.queryByRole('button', { name: 'Kamera öffnen' })).toBeNull();
//   });
// });
