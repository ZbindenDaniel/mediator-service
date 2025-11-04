import assert from 'node:assert/strict';
import McpClientManager from '../search/McpClientManager.js';

function createTestLogger() {
  const logs = [];
  const makeLogger = (level) => (payload) => {
    logs.push({ level, payload });
  };
  return {
    logs,
    error: makeLogger('error'),
    warn: makeLogger('warn'),
    info: makeLogger('info'),
    debug: makeLogger('debug'),
  };
}

class FakeTransport {
  constructor() {
    this.closeCalls = 0;
    this.onclose = undefined;
    this.onerror = undefined;
  }

  async close() {
    this.closeCalls += 1;
    this.closed = true;
  }

  emitClose() {
    if (typeof this.onclose === 'function') {
      this.onclose();
    }
  }

  emitError(error) {
    if (typeof this.onerror === 'function') {
      this.onerror(error);
    }
  }
}

class FakeClient {
  constructor() {
    this.closeCalls = 0;
    this.handlers = new Map();
  }

  async connect(transport) {
    this.transport = transport;
  }

  async close() {
    this.closeCalls += 1;
    this.closed = true;
  }

  on(event, handler) {
    this.handlers.set(event, handler);
  }

  emit(event, ...args) {
    const handler = this.handlers.get(event);
    if (handler) {
      handler(...args);
    }
  }

  async listTools() {
    return { tools: [{ name: 'search' }] };
  }
}

function flushMicrotasks() {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

export async function runMcpClientManagerTests() {
  const env = { MCP_SEARCH_CMD: 'dummy', MCP_SEARCH_ARGS: '' };
  const logger = createTestLogger();
  const clients = [];

  const manager = new McpClientManager({
    env,
    resolveCommand: async (value) => value,
    createTransport: () => {
      const transport = new FakeTransport();
      return transport;
    },
    createClient: () => {
      const client = new FakeClient();
      clients.push(client);
      return client;
    },
    logger,
  });

  const firstConnection = await manager.connect();
  assert.equal(clients.length, 1, 'expected exactly one client after first connect');

  firstConnection.transport.emitClose();
  await flushMicrotasks();

  assert.equal(firstConnection.client.closeCalls, 1, 'client.close should run during transport disconnect cleanup');
  assert.equal(firstConnection.transport.closeCalls, 0, 'transport.close should not be called when transport initiated closure');

  const secondConnection = await manager.connect();
  assert.equal(clients.length, 2, 'expected a new client after reconnect');
  assert.notStrictEqual(secondConnection.client, firstConnection.client, 'new connection should use a different client instance');

  const disconnectError = new Error('transport failure');
  secondConnection.transport.emitError(disconnectError);
  await flushMicrotasks();

  assert.equal(secondConnection.client.closeCalls, 1, 'client.close should run during transport error cleanup');
  assert.equal(secondConnection.transport.closeCalls, 1, 'transport.close should run when disconnect triggered by error');

  const thirdConnection = await manager.connect();
  assert.equal(clients.length, 3, 'expected third client after second disconnect');
  assert.notStrictEqual(thirdConnection.client, secondConnection.client, 'new connection should use a different client after error');

  assert(logger.logs.some((entry) => entry.level === 'error'), 'expected at least one error level log to be recorded');
}
