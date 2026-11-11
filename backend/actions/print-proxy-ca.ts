import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { getSetting } from '../utils/app-settings';

// Serves the print proxy's CA certificate so workstations can import it with one click instead of
// copying ca.crt off the Raspi. A CA certificate is public data; the admin form rejects private keys.

export const PRINT_PROXY_CA_PATH = '/api/print/proxy-ca.crt';

const action = defineHttpAction({
  feature: 'printing',
  key: 'print-proxy-ca',
  label: 'Print proxy CA certificate download',
  appliesTo: () => false,
  matches: (p, m) => p === PRINT_PROXY_CA_PATH && m === 'GET',
  async handle(_req: IncomingMessage, res: ServerResponse) {
    try {
      const pem = (await getSetting('printer.browser_ca_pem', '')).trim();
      if (!pem) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Kein Druckserver-Zertifikat hinterlegt (Admin → Drucker-Einstellungen).');
        return;
      }
      res.writeHead(200, {
        // x-x509-ca-cert makes Windows/Android offer "install certificate" directly.
        'Content-Type': 'application/x-x509-ca-cert',
        'Content-Disposition': 'attachment; filename="druckserver-ca.crt"',
        'Cache-Control': 'no-store'
      });
      res.end(`${pem}\n`);
    } catch (err) {
      console.error('[print-proxy-ca] Failed to serve CA certificate', err);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('error');
    }
  },
  view: () => '<div class="card"><p class="muted">Print proxy CA download</p></div>'
});

export default action;
