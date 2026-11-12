export const PRINT_PROXY_CA_URL = '/api/print/proxy-ca.crt';

export async function hasPrintProxyCa(signal: AbortSignal): Promise<boolean> {
  // Probe the public download rather than exposing admin settings or downloading the PEM on open.
  const response = await fetch(PRINT_PROXY_CA_URL, { method: 'HEAD', cache: 'no-store', signal });
  return response.ok;
}
