//TODO(fix-tests): Re-enable after fixing test environment issues
// import React from 'react';
// import { ItemMatchSelection } from '../frontend/src/components/ItemMatchSelection';

// describe('ItemMatchSelection workflow effects', () => {
//   const originalFetch = global.fetch;

//   afterEach(() => {
//     global.fetch = originalFetch;
//     jest.restoreAllMocks();
//   });

//   it('sets an error state when the search request fails', async () => {
//     const setLoading = jest.fn();
//     const setError = jest.fn();
//     const setItems = jest.fn();
//     const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

//     const useStateMock = jest.spyOn(React, 'useState');
//     useStateMock
//       .mockImplementationOnce((initial: unknown) => [initial, setLoading] as any)
//       .mockImplementationOnce((initial: unknown) => [initial, setError] as any)
//       .mockImplementationOnce((initial: unknown) => [initial, setItems] as any);

//     let effectCallback: (() => void | (() => void)) | null = null;
//     jest.spyOn(React, 'useEffect').mockImplementation((callback) => {
//       effectCallback = callback;
//     });

//     const fetchMock = jest.fn().mockRejectedValue(new Error('network down'));
//     global.fetch = fetchMock as typeof fetch;

//     try {
//       ItemMatchSelection({ searchTerm: 'Tablet', onSelect: jest.fn(), onSkip: jest.fn() });
//       effectCallback?.();
//       await new Promise((resolve) => setImmediate(resolve));

//       expect(fetchMock).toHaveBeenCalledTimes(1);
//       expect(fetchMock).toHaveBeenCalledWith('/api/search?term=Tablet&scope=refs', expect.any(Object));
//       expect(setError).toHaveBeenCalledWith('Ähnliche Artikel konnten nicht geladen werden.');
//       expect(setItems).toHaveBeenCalledWith([]);
//       expect(setLoading).toHaveBeenCalledWith(false);
//       expect(consoleError).toHaveBeenCalledWith('Duplicate candidate search failed', expect.any(Error));
//     } catch (error) {
//       console.error('[test] ItemMatchSelection error flow failed', error);
//       throw error;
//     }
//   });

//   it('logs an abort message when an in-flight search is cancelled', async () => {
//     const setLoading = jest.fn();
//     const setError = jest.fn();
//     const setItems = jest.fn();
//     const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => undefined);

//     const useStateMock = jest.spyOn(React, 'useState');
//     useStateMock
//       .mockImplementationOnce((initial: unknown) => [initial, setLoading] as any)
//       .mockImplementationOnce((initial: unknown) => [initial, setError] as any)
//       .mockImplementationOnce((initial: unknown) => [initial, setItems] as any);

//     let effectCallback: (() => void | (() => void)) | null = null;
//     jest.spyOn(React, 'useEffect').mockImplementation((callback) => {
//       effectCallback = callback;
//     });

//     let rejectFetch: ((error: Error) => void) | null = null;
//     const fetchMock = jest.fn().mockImplementation(() => {
//       return new Promise((_resolve, reject) => {
//         rejectFetch = reject;
//       });
//     });
//     global.fetch = fetchMock as typeof fetch;

//     try {
//       ItemMatchSelection({ searchTerm: 'Router', onSelect: jest.fn(), onSkip: jest.fn() });
//       const cleanup = effectCallback?.();
//       cleanup?.();

//       if (rejectFetch) {
//         rejectFetch(new Error('aborted'));
//       }

//       await new Promise((resolve) => setImmediate(resolve));

//       expect(fetchMock).toHaveBeenCalledTimes(1);
//       expect(setLoading).toHaveBeenCalledWith(true);
//       expect(setError).not.toHaveBeenCalledWith('Ähnliche Artikel konnten nicht geladen werden.');
//       expect(consoleLog).toHaveBeenCalledWith('Duplicate candidate search aborted');
//     } catch (error) {
//       console.error('[test] ItemMatchSelection abort flow failed', error);
//       throw error;
//     }
//   });
// });
