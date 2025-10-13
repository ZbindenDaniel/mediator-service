// import type { AddressInfo } from 'net';
// import type { IncomingMessage, ServerResponse } from 'http';
// import agenticHealthAction, { forwardAgenticHealth } from '../backend/actions/agentic-health';
// import { server, resetData, setAgenticHealthResponse, getAgenticHealthCheckCount } from './server';

// function createMockResponse() {
//   let statusCode = 0;
//   let headers: Record<string, string> = {};
//   let body = '';

//   const res = {
//     writeHead: (status: number, responseHeaders: Record<string, string>) => {
//       statusCode = status;
//       headers = { ...responseHeaders };
//       return res;
//     },
//     end: (chunk?: any) => {
//       if (chunk !== undefined && chunk !== null) {
//         body = Buffer.isBuffer(chunk) ? chunk.toString('utf-8') : String(chunk);
//       }
//       return res;
//     }
//   } as unknown as ServerResponse;

//   return {
//     res,
//     getStatus: () => statusCode,
//     getHeaders: () => headers,
//     getBody: () => body
//   };
// }

// describe('agentic health proxy action', () => {
//   let baseUrl = '';
//   let originalAgenticBase: string | undefined;

//   beforeAll(async () => {
//     await new Promise<void>((resolve) => {
//       server.listen(0, () => {
//         const addr = server.address();
//         if (typeof addr === 'object' && addr) {
//           baseUrl = `http://127.0.0.1:${(addr as AddressInfo).port}`;
//         }
//         resolve();
//       });
//     });
//   });

//   afterAll(async () => {
//     await new Promise<void>((resolve) => {
//       server.close(() => resolve());
//     });
//   });

//   beforeEach(() => {
//     resetData();
//     originalAgenticBase = process.env.AGENTIC_API_BASE;
//   });

//   afterEach(() => {
//     process.env.AGENTIC_API_BASE = originalAgenticBase;
//   });

//   test('forwards health check to configured agentic service', async () => {
//     process.env.AGENTIC_API_BASE = baseUrl;
//     setAgenticHealthResponse(200, { ok: true, upstream: 'healthy' });

//     const { res, getStatus, getBody } = createMockResponse();

//     await agenticHealthAction.handle?.({} as IncomingMessage, res, { agenticServiceEnabled: true });

//     expect(getStatus()).toBe(200);
//     expect(JSON.parse(getBody())).toEqual({ ok: true, upstream: 'healthy' });
//     expect(getAgenticHealthCheckCount()).toBe(1);
//   });

//   test('propagates upstream failure response', async () => {
//     process.env.AGENTIC_API_BASE = baseUrl;
//     setAgenticHealthResponse(503, { ok: false, reason: 'maintenance' });

//     const { res, getStatus, getBody } = createMockResponse();

//     await agenticHealthAction.handle?.({} as IncomingMessage, res, { agenticServiceEnabled: true });

//     expect(getStatus()).toBe(503);
//     expect(JSON.parse(getBody())).toEqual({ ok: false, reason: 'maintenance' });
//     expect(getAgenticHealthCheckCount()).toBe(1);
//   });

//   test('returns service unavailable when agentic proxy disabled', async () => {
//     process.env.AGENTIC_API_BASE = baseUrl;
//     const { res, getStatus, getBody } = createMockResponse();

//     await agenticHealthAction.handle?.({} as IncomingMessage, res, { agenticServiceEnabled: false });

//     expect(getStatus()).toBe(503);
//     expect(JSON.parse(getBody())).toEqual({ ok: false, error: 'Agentic service disabled' });
//     expect(getAgenticHealthCheckCount()).toBe(0);
//   });
// });

// describe('forwardAgenticHealth', () => {
//   test('throws when AGENTIC_API_BASE is missing', async () => {
//     await expect(forwardAgenticHealth({ agenticApiBase: null })).rejects.toThrow(
//       'Agentic API base URL is not configured'
//     );
//   });

//   test('throws AgenticHealthRequestError on network failure', async () => {
//     const failingFetch = jest.fn(() => Promise.reject(new Error('network down')));
//     await expect(
//       forwardAgenticHealth({ agenticApiBase: 'http://127.0.0.1:0', fetchImpl: failingFetch as any })
//     ).rejects.toHaveProperty('reason', 'network-error');
//   });
// });
