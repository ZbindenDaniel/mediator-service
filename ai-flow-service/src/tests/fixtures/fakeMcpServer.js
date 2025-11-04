import readline from 'node:readline';
import process from 'node:process';

const rl = readline.createInterface({ input: process.stdin, terminal: false });
let toolInvocationCount = 0;

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

function handleRequest(message) {
  if (message.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'fake-mcp-server', version: '0.0.1' },
        instructions: 'Fake MCP server for tests.',
      },
    });
    return;
  }

  if (message.method === 'tools/list') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        tools: [
          {
            name: 'search',
            description: 'Fake search tool used for reconnect tests.',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string' },
                limit: { type: 'number' },
              },
              required: ['query'],
            },
          },
        ],
      },
    });
    return;
  }

  if (message.method === 'tools/call') {
    toolInvocationCount += 1;
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        content: [
          {
            type: 'text',
            text: `Fake search run ${toolInvocationCount}`,
          },
        ],
      },
    });
    setTimeout(() => {
      process.stderr.write('fake MCP server exiting after tool call\n');
      process.exit(0);
    }, 20);
    return;
  }

  if (message.method === 'ping') {
    send({ jsonrpc: '2.0', id: message.id, result: {} });
    return;
  }

  send({
    jsonrpc: '2.0',
    id: message.id,
    error: { code: -32601, message: `Method not found: ${message.method}` },
  });
}

rl.on('line', line => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let message;
  try {
    message = JSON.parse(trimmed);
  } catch (error) {
    process.stderr.write(`Failed to parse message: ${error}\n`);
    return;
  }

  if (message.id === undefined) {
    // Notification: ignore.
    return;
  }

  try {
    handleRequest(message);
  } catch (error) {
    process.stderr.write(`Error handling request: ${error}\n`);
    send({
      jsonrpc: '2.0',
      id: message.id,
      error: { code: -32603, message: 'Internal error' },
    });
  }
});

rl.on('close', () => {
  process.exit(0);
});
