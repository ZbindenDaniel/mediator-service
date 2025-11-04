// src/tools/searchWeb.js
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from '../utils/zod.js';
import { logger } from '../utils/logger.js';
import { parseSearchResponse, RateLimitError } from '../search/responseParser.js';
import { getMcpClient } from '../utils/mcpClient.js';

export { RateLimitError } from '../search/responseParser.js';

export async function searchWebRaw(query, max_results = 10) {
  try {
    logger.debug({ msg: 'searchWebRaw invoked', query, max_results });

    const { client } = await getMcpClient();
    const response = await client.callTool({
      name: 'search',
      arguments: { query, limit: max_results },
    });

    if (response?.isError) {
      logger.debug({ msg: 'searchWebRaw received MCP error response', query, response });
    }

    const { text, sources } = parseSearchResponse(response, { query, limit: max_results });
    
    if( text == '' || sources.length == 0){
      logger.error("Web Search failed");
      throw new Error("Web Search failed")
    }

    logger.debug({ msg: 'searchWebRaw success', query, resultCount: sources.length });

    return { text, sources };
  } catch (error) {
    if (error instanceof RateLimitError) {
      logger.error({
        msg: 'searchWebRaw rate limited',
        query,
        statusCode: error.statusCode,
        detail: error.detail,
      });
      throw error;
    }

    const message = error?.message ?? String(error ?? 'searchWebRaw failed');
    logger.error({ msg: 'searchWebRaw error', query, error: message });

    const wrapped = new Error(message);
    wrapped.query = query;
    if (error instanceof Error && error.cause !== undefined) {
      wrapped.cause = error.cause;
    }
    throw wrapped;
  }
}

export const searchWeb = new DynamicStructuredTool({
  name: 'searchWeb',
  description: 'Web search via local MCP server (stdio).',
  schema: z.object({
    query: z.string(),
    max_results: z.number().int().min(1).max(10).default(5),
  }),
  func: async ({ query, max_results }) => {
    logger.debug({ msg: 'searchWeb tool invoked', query, max_results });
    const { text } = await searchWebRaw(query, max_results);
    return text;
  },
});
