#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError, } from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import * as cheerio from 'cheerio';
import logger from './logger.js';

const isValidSearchArgs = (args) => typeof args === 'object' &&
    args !== null &&
    typeof args.query === 'string' &&
    (args.limit === undefined || typeof args.limit === 'number');
export class WebSearchServer {
    server;
    constructor() {
        this.server = new Server({
            name: 'web-search',
            version: '0.1.0',
        }, {
            capabilities: {
                tools: {},
            },
        });
        this.setupToolHandlers();
        this.server.onerror = (error) => {
            const serializedError = error instanceof Error
                ? { message: error.message, stack: error.stack }
                : error;
            logger.error({
                msg: 'Web search MCP server error',
                tool: 'search',
                error: serializedError,
            });
        };

        process.on('SIGINT', async () => {
            try {
                await this.server.close();
                logger.info({
                    msg: 'Web search MCP server shut down via SIGINT',
                    tool: 'search',
                });
                process.exit(0);
            }
            catch (error) {
                const serializedError = error instanceof Error
                    ? { message: error.message, stack: error.stack }
                    : error;
                logger.error({
                    msg: 'Error while shutting down web search MCP server',
                    tool: 'search',
                    error: serializedError,
                });
                process.exit(1);
            }
        });
    }
    setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: 'search',
                    description: 'Search the web using Tavily (set TAVILY_API_KEY in the environment to authenticate backend requests)',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            query: {
                                type: 'string',
                                description: 'Search query',
                            },
                            limit: {
                                type: 'number',
                                description: 'Maximum number of results to return (default: 5)',
                                minimum: 1,
                                maximum: 10,
                            },
                        },
                        required: ['query'],
                    },
                },
            ],
        }));
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            if (!isValidSearchArgs(request.params.arguments)) {
                throw new McpError(ErrorCode.InvalidParams, 'In valid search arguments');
            }
            const query = request.params.arguments.query;
            const limit = Math.min(request.params.arguments.limit || 5, 10);
            try {
                const rawResults = await this.performSearch(query, limit);
                const tavilyResults = Array.isArray(rawResults)
                    ? rawResults
                    : Array.isArray(rawResults?.results)
                        ? rawResults.results
                        : [];
                const slicedResults = tavilyResults.slice(0, limit);
                const searchResult = slicedResults.map((item) => {
                    const rawDescription = typeof item?.description === 'string'
                        ? item.description
                        : typeof item?.content === 'string'
                            ? item.content
                            : typeof item?.rawContent === 'string'
                                ? item.rawContent
                                : '';
                    return {
                        title: typeof item?.title === 'string' ? item.title : '',
                        url: typeof item?.url === 'string' ? item.url : '',
                        content: typeof item?.content === 'string' ? item.content : '',
                        description: rawDescription,
                        score: typeof item?.score === 'number' ? item.score : null,
                    };
                });
                if (searchResult.length === 0) {
                    logger.info({
                        msg: 'Search completed with no results',
                        tool: 'search',
                        query,
                        limit,
                        request: request
                    });
                    return {
                        content: [
                            {
                                type: 'text',
                                text: 'No results found.',
                            },
                        ],
                    };
                }

                const topUrls = searchResult
                    .filter((item) => item.url)
                    .slice(0, 3)
                    .map((item) => item.url);

                logger.info({
                    msg: 'Search completed successfully',
                    tool: 'search',
                    query,
                    limit,
                    resultCount: searchResult.length,
                    mappedItems: searchResult.length,
                    topUrls,
                });

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(searchResult, null, 2),
                        },
                    ],
                };
            }
            catch (error) {
                const serializedError = error instanceof Error
                    ? { message: error.message, stack: error.stack }
                    : error;
                logger.error({
                    msg: 'Search request failed',
                    tool: 'search',
                    query,
                    limit,
                    error: serializedError,
                });
                if (axios.isAxiosError(error)) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Search error: ${error.message}`,
                            },
                        ],
                        isError: true,
                    };
                }
                const internalErrorMessage = typeof serializedError?.message === 'string'
                    ? serializedError.message
                    : 'An unexpected error occurred during the search request.';
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Internal search error: ${internalErrorMessage}`,
                        },
                    ],
                    isError: true,
                    metadata: {
                        code: ErrorCode.InternalError,
                        context: {
                            query,
                            limit,
                            error: serializedError,
                        },
                    },
                };
            }
        });
    }
    async performSearch(query, limit) {
        const apiKey = process.env.TAVILY_API_KEY;

        if (!apiKey) {
            logger.error({
                msg: 'Tavily API key missing from environment',
                tool: 'search',
            });
            throw new McpError(ErrorCode.InternalError, 'Tavily API key is required to perform web search requests');
        }

        try {
            let tavilyFactory;
            try {
                const module = await import('@tavily/core');
                tavilyFactory = module?.tavily;
            }
            catch (importError) {
                const serializedImportError = importError instanceof Error
                    ? { message: importError.message, stack: importError.stack }
                    : importError;
                logger.error({
                    msg: 'Failed to load Tavily client',
                    tool: 'search',
                    error: serializedImportError,
                });
                throw new McpError(ErrorCode.InternalError, 'Unable to initialize Tavily client');
            }
            const tvly = typeof tavilyFactory === 'function'
                ? tavilyFactory({ apiKey })
                : null;
            if (!tvly) {
                logger.error({
                    msg: 'Tavily client factory did not return a client instance',
                    tool: 'search',
                });
                throw new McpError(ErrorCode.InternalError, 'Tavily client could not be initialized');
            }
            logger.info({
                msg: 'Performing Tavily search',
                tool: 'search',
                query,
                limit,
            });

            const response = await tvly.search(
                `${query}`,
                {maxResults: limit}
            );

            return Array.isArray(response?.results) ? response.results : [];
        }
        catch (error) {
            const serializedError = error instanceof Error
                ? { message: error.message, stack: error.stack }
                : error;

            logger.error({
                msg: 'Tavily search request failed',
                tool: 'search',
                query,
                limit,
                error: serializedError,
            });

            throw error;
        }
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
    }
}
const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] === modulePath) {
    const server = new WebSearchServer();
    server.run();
}
