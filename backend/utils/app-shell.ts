import fs from 'fs';
import type { IncomingMessage, ServerResponse } from 'http';

// The app shell (index.html, bundle.js, bundle.css) is served under fixed URLs without content
// hashes, so without cache headers browsers heuristically reuse an old bundle after a deploy (new
// UI silently missing). `no-cache` makes them revalidate every time; the ETag keeps that cheap
// (304 when unchanged). Hashed file names would avoid revalidation but need build changes.
export function sendAppShellFile(
  req: IncomingMessage,
  res: ServerResponse,
  filePath: string,
  contentType: string
): void {
  const stat = fs.statSync(filePath);
  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  const headers = { 'Content-Type': contentType, 'Cache-Control': 'no-cache', ETag: etag };
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    res.end();
    return;
  }
  res.writeHead(200, headers);
  res.end(fs.readFileSync(filePath));
}
