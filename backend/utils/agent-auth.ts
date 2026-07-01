import type { IncomingMessage, ServerResponse } from 'http';
import { AGENT_TOKEN } from '../config';

// Same shared-secret bearer scheme as the /agent WebSocket handshake
// (docs/PLANNING_multi_instance.md) — these HTTP endpoints are the data-plane
// counterpart agents use to claim/report jobs alongside the WebSocket control plane.
export function requireAgentAuth(req: IncomingMessage, res: ServerResponse): boolean {
  // Fail closed when AGENT_TOKEN is unset — agentServer.ts rejects WebSocket connections
  // the same way, so both layers are consistent.
  if (!AGENT_TOKEN) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return false;
  }
  const header = (req.headers.authorization || '').trim();
  if (header === `Bearer ${AGENT_TOKEN}`) return true;
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Unauthorized' }));
  return false;
}
