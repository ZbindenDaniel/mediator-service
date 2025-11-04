import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { logger as defaultLogger } from '../utils/logger.js';

export default class McpClientManager {
  constructor({ env, resolveCommand, logger = defaultLogger } = {}) {
    if (!env) {
      throw new Error('env configuration is required to construct McpClientManager');
    }
    if (typeof resolveCommand !== 'function') {
      throw new Error('resolveCommand function is required to construct McpClientManager');
    }

    this.env = env;
    this.resolveCommand = resolveCommand;
    this.logger = logger;
    this.connectionPromise = undefined;
    this.activeConnection = undefined;
  }

  async connect() {
    if (!this.connectionPromise) {
      this.connectionPromise = this.#createConnection();
    }
    return this.connectionPromise;
  }

  async reset(reason = 'manual.reset') {
    if (this.activeConnection) {
      const { client, transport } = this.activeConnection;
      try {
        if (typeof client?.close === 'function') {
          await client.close();
        }
      } catch (error) {
        this.logger.warn?.({ msg: 'Failed to close MCP client', reason, error: error?.message ?? error });
      }
      try {
        if (typeof transport?.close === 'function') {
          await transport.close();
        }
      } catch (error) {
        this.logger.warn?.({ msg: 'Failed to close MCP transport', reason, error: error?.message ?? error });
      }
    }
    this.connectionPromise = undefined;
    this.activeConnection = undefined;
  }

  async #createConnection() {
    const { MCP_SEARCH_CMD, MCP_SEARCH_ARGS, ...forwardEnv } = this.env;
    const command = await this.resolveCommand(MCP_SEARCH_CMD);
    const args = MCP_SEARCH_ARGS ? MCP_SEARCH_ARGS.split(' ').filter(Boolean) : [];
    const sanitizedEnv = Object.fromEntries(
      Object.entries(forwardEnv).filter(([, value]) => value !== undefined),
    );
    const mergedEnv = { ...process.env, ...sanitizedEnv };
    const transport = new StdioClientTransport({ command, args, env: mergedEnv });
    const client = new Client({ name: 'ai-flow-service', version: '0.1.0' }, { capabilities: {} });

    try {
      await client.connect(transport);
      const { tools } = await client.listTools();
      const toolNames = (tools ?? []).map((tool) => tool.name);
      if (!toolNames.includes('search')) {
        throw new Error('Connected MCP server does not expose a "search" tool');
      }
      this.activeConnection = { client, transport };
      return this.activeConnection;
    } catch (error) {
      await this.reset('connect.failure');
      throw error;
    }
  }
}
