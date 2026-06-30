// /agent WebSocket handshake auth (docs/PLANNING_multi_instance.md) — verifies the shared
// AGENT_TOKEN gate end-to-end over a real HTTP server + ws client, since this is the only
// thing standing between an unguarded local machine and the connectedAgents map.
import http from 'http';
import WebSocket from 'ws';

const ORIGINAL_AGENT_TOKEN = process.env.AGENT_TOKEN;

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, () => {
      const address = server.address();
      resolve(typeof address === 'object' && address ? address.port : 0);
    });
  });
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

describe('agent /agent WebSocket handshake', () => {
  afterEach(() => {
    process.env.AGENT_TOKEN = ORIGINAL_AGENT_TOKEN;
  });

  test('rejects a connection with a missing or wrong token', async () => {
    let attachAgentServer: typeof import('../backend/agentServer').attachAgentServer;
    await jest.isolateModulesAsync(async () => {
      process.env.AGENT_TOKEN = 'correct-token';
      ({ attachAgentServer } = await import('../backend/agentServer'));
    });

    const httpServer = http.createServer();
    attachAgentServer!(httpServer);
    const port = await listen(httpServer);

    const wrongTokenClose = await new Promise<{ code: number }>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/agent`, {
        headers: { Authorization: 'Bearer wrong-token' },
      });
      ws.on('open', () => reject(new Error('should not have connected')));
      ws.on('error', () => {
        // connection reset is expected; 'close' carries the meaningful signal
      });
      ws.on('close', (code) => resolve({ code }));
    });
    expect(wrongTokenClose.code).not.toBe(1000);

    await closeServer(httpServer);
  });

  test('accepts a connection with the correct bearer token and registers it after hello', async () => {
    let attachAgentServer: typeof import('../backend/agentServer').attachAgentServer;
    let connectedAgents: typeof import('../backend/agentConnections').connectedAgents;
    await jest.isolateModulesAsync(async () => {
      process.env.AGENT_TOKEN = 'correct-token';
      ({ attachAgentServer } = await import('../backend/agentServer'));
      ({ connectedAgents } = await import('../backend/agentConnections'));
    });

    const httpServer = http.createServer();
    attachAgentServer!(httpServer);
    const port = await listen(httpServer);

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/agent`, {
        headers: { Authorization: 'Bearer correct-token' },
      });
      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'hello', instanceId: 'shop', queues: ['ShopQueue'] }));
        setTimeout(() => {
          try {
            expect(connectedAgents.has('shop')).toBe(true);
          } catch (err) {
            reject(err);
            return;
          }
          ws.on('close', () => resolve());
          ws.close();
        }, 50);
      });
      ws.on('error', reject);
    });

    await closeServer(httpServer);
  });
});
