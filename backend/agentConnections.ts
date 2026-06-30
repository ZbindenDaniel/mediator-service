import type WebSocket from 'ws';

// Shared between server.ts (owns the WebSocket /agent endpoint) and print.ts
// (needs to know which agents are online to route jobs / skip offline queues).
// Kept in its own module so print.ts doesn't depend on server.ts (would be circular).
export const connectedAgents: Map<string, WebSocket> = new Map();

export function isAgentConnected(instanceId: string): boolean {
  const ws = connectedAgents.get(instanceId);
  return !!ws && ws.readyState === ws.OPEN;
}

export function sendToAgent(instanceId: string, message: unknown): boolean {
  const ws = connectedAgents.get(instanceId);
  if (!ws || ws.readyState !== ws.OPEN) {
    return false;
  }
  ws.send(JSON.stringify(message));
  return true;
}

export function registerAgent(instanceId: string, ws: WebSocket): void {
  connectedAgents.set(instanceId, ws);
}

export function unregisterAgent(instanceId: string, ws: WebSocket): void {
  if (connectedAgents.get(instanceId) === ws) {
    connectedAgents.delete(instanceId);
  }
}

export function listConnectedInstanceIds(): string[] {
  return Array.from(connectedAgents.keys()).filter((id) => isAgentConnected(id));
}

export function broadcastToAgents(message: unknown): void {
  for (const instanceId of listConnectedInstanceIds()) {
    sendToAgent(instanceId, message);
  }
}
