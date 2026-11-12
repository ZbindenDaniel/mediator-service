import type { IncomingMessage, ServerResponse } from 'http';
import action from '../actions/print-proxy-ca';
import { getSetting } from '../utils/app-settings';

jest.mock('../actions/index', () => ({ defineHttpAction: (value: unknown) => value }));
jest.mock('../utils/app-settings', () => ({ getSetting: jest.fn() }));

async function request(method: string, certificate: string) {
  (getSetting as jest.Mock).mockResolvedValue(certificate);
  const res = { writeHead: jest.fn(), end: jest.fn() };
  await action.handle({ method } as IncomingMessage, res as unknown as ServerResponse);
  return res;
}

test('HEAD reports certificate availability without sending the certificate', async () => {
  expect(action.matches('/api/print/proxy-ca.crt', 'HEAD')).toBe(true);
  expect(action.feature).toBe('printing');
  const res = await request('HEAD', 'PUBLIC CA');
  expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({ 'Content-Type': 'application/x-x509-ca-cert' }));
  expect(res.end).toHaveBeenCalledWith(undefined);
});

test('HEAD reports a missing certificate without a response body', async () => {
  const res = await request('HEAD', '  ');
  expect(res.writeHead).toHaveBeenCalledWith(404, expect.anything());
  expect(res.end).toHaveBeenCalledWith(undefined);
});

test('GET retains the existing certificate download', async () => {
  const res = await request('GET', ' PUBLIC CA ');
  expect(res.end).toHaveBeenCalledWith('PUBLIC CA\n');
  expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({ 'Content-Disposition': 'attachment; filename="druckserver-ca.crt"' }));
});
