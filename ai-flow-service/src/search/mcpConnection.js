// src/search/mcpConnection.js
import { logger } from '../utils/logger.js';
import { resetMcpClient } from '../utils/mcpClient.js';

const CONNECTION_ERROR_CODES = new Set(['EPIPE', 'ECONNRESET', 'ECONNREFUSED', 'ERR_IPC_CHANNEL_CLOSED']);
const CONNECTION_ERROR_PATTERNS = ['broken pipe', 'channel closed', 'socket hang up', 'transport closed'];

export function isConnectionError(error) {
  if (!error) {
    return false;
  }

  const code = typeof error?.code === 'string' ? error.code : undefined;
  if (code && CONNECTION_ERROR_CODES.has(code)) {
    return true;
  }

  const message =
    typeof error?.message === 'string'
      ? error.message
      : typeof error === 'string'
      ? error
      : undefined;

  if (!message) {
    return false;
  }

  const lower = message.toLowerCase();
  return CONNECTION_ERROR_PATTERNS.some((pattern) => lower.includes(pattern));
}

export async function resetSearchConnection(reason = 'search.reset') {
  try {
    await resetMcpClient(reason);
  } catch (error) {
    logger.error({
      msg: 'Failed to reset MCP client from searchWeb',
      reason,
      error: error?.message ?? error,
    });
  }
}
