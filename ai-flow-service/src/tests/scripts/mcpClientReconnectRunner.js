import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { getMcpClient } from '../../utils/mcpClient.js';

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const baseDir = dirname(fileURLToPath(import.meta.url));
  const serverPath = join(baseDir, '..', 'fixtures', 'fakeMcpServer.js');

  process.env.MCP_SEARCH_CMD = process.env.MCP_SEARCH_CMD || process.execPath;
  process.env.MCP_SEARCH_ARGS = process.env.MCP_SEARCH_ARGS || `${serverPath}`;

  let firstConnection;
  let secondConnection;

  try {
    firstConnection = await getMcpClient();
    const firstResponse = await firstConnection.client.callTool({
      name: 'search',
      arguments: { query: 'first run', limit: 1 },
    });
    assert.ok(Array.isArray(firstResponse?.content), 'expected first call to return content array');

    await wait(150);

    secondConnection = await getMcpClient();
    assert.notStrictEqual(secondConnection.client, firstConnection.client, 'expected new client instance after reconnect');

    const secondResponse = await secondConnection.client.callTool({
      name: 'search',
      arguments: { query: 'second run', limit: 1 },
    });
    assert.ok(Array.isArray(secondResponse?.content), 'expected second call to return content array');

    await wait(150);
  } finally {
    if (firstConnection?.client) {
      try {
        await firstConnection.client.close();
      } catch (error) {
        console.error('Error closing first MCP client in runner', error);
      }
    }
    if (secondConnection?.client && secondConnection.client !== firstConnection?.client) {
      try {
        await secondConnection.client.close();
      } catch (error) {
        console.error('Error closing second MCP client in runner', error);
      }
    }
  }

  console.log('mcpClient reconnect runner completed');
}

main().catch((error) => {
  console.error('mcpClient reconnect runner failed', error);
  process.exit(1);
});
