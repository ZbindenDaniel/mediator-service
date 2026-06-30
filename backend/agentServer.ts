import type { IncomingMessage } from 'http';
import type { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { AGENT_TOKEN } from './config';
import { registerAgent, unregisterAgent } from './agentConnections';

interface AgentHelloMessage {
  type: 'hello';
  instanceId: string;
  queues?: string[];
}

type AgentMessage = AgentHelloMessage | { type: string; [key: string]: unknown };

function parseBearerToken(authHeader: string | undefined): string {
  if (!authHeader) return '';
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return match ? match[1].trim() : '';
}

// Wires a /agent WebSocket endpoint onto the existing HTTP server (single cloud
// instance, so the in-memory connectedAgents map needs no cross-instance sync).
export function attachAgentServer(httpServer: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req: IncomingMessage, socket, head) => {
    if (req.url !== '/agent') {
      return;
    }

    if (!AGENT_TOKEN) {
      console.error('[agentServer] AGENT_TOKEN not configured; rejecting agent connection.');
      socket.destroy();
      return;
    }

    const token = parseBearerToken(req.headers['authorization']);
    if (token !== AGENT_TOKEN) {
      console.warn('[agentServer] Rejected agent connection with invalid token.');
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws: WebSocket) => {
    let instanceId = '';

    ws.on('message', (raw: Buffer) => {
      let message: AgentMessage;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        console.warn('[agentServer] Received malformed message from agent; ignoring.');
        return;
      }

      if (message.type === 'hello') {
        const hello = message as AgentHelloMessage;
        if (!hello.instanceId) {
          console.warn('[agentServer] hello message missing instanceId; ignoring.');
          return;
        }
        instanceId = hello.instanceId;
        registerAgent(instanceId, ws);
        console.info('[agentServer] Agent connected', { instanceId, queues: hello.queues ?? [] });
        return;
      }

      console.info('[agentServer] Received message from agent', { instanceId, type: message.type });
    });

    ws.on('close', () => {
      if (instanceId) {
        unregisterAgent(instanceId, ws);
        console.info('[agentServer] Agent disconnected', { instanceId });
      }
    });

    ws.on('error', (err) => {
      console.error('[agentServer] Agent socket error', { instanceId, error: err });
    });
  });

  return wss;
}
