import { z } from './zod.js';
import { access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';

import { logger } from './logger.js';
import McpClientManager from '../search/McpClientManager.js';
import { searchConfig } from '../config/index.js';

const envSchema = z.object({
  MCP_SEARCH_CMD: z.string().optional(),
  MCP_SEARCH_ARGS: z.string().optional().default(''),
  TAVILY_API_KEY: z.string().min(1).optional(),
});

const rawEnv = {
  MCP_SEARCH_CMD: process.env.MCP_SEARCH_CMD,
  MCP_SEARCH_ARGS: process.env.MCP_SEARCH_ARGS,
  TAVILY_API_KEY: searchConfig.tavilyApiKey ?? process.env.TAVILY_API_KEY,
};

const env = envSchema.parse(rawEnv);

if (!env.TAVILY_API_KEY) {
  logger.warn({
    msg: 'TAVILY_API_KEY is not set; Tavily web search requests may fail to authenticate',
  });
}

async function resolveCommand(cmd) {
  if (!cmd) {
    throw new Error(
      'MCP_SEARCH_CMD is not set. For pskill9/web-search set:\n' +
      '  MCP_SEARCH_CMD=node\n' +
      '  MCP_SEARCH_ARGS=/abs/path/to/web-search/index.js'
    );
  }
  // If looks like a path, ensure it exists/executable
  if (cmd.includes('/') || cmd.includes('\\')) {
    await access(cmd, fsConstants.X_OK).catch(() => {
      throw new Error(`MCP_SEARCH_CMD not executable or missing: ${cmd}`);
    });
  }
  return cmd;
}

let manager;

function getManager() {
  if (!manager) {
    manager = new McpClientManager({
      env,
      resolveCommand,
      logger,
    });
  }

  return manager;
}

export async function resetMcpClient(reason = 'manual.reset') {
  return getManager().reset(reason);
}

export async function getMcpClient() {
  return getManager().connect();
}
