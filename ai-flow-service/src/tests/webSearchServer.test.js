import assert from 'node:assert/strict';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { WebSearchServer } from '../../web-search/index.js';

class FailingWebSearchServer extends WebSearchServer {
  async performSearch() {
    throw new Error('Failed to parse search results');
  }
}

class SuccessfulWebSearchServer extends WebSearchServer {
  async performSearch() {
    return [
      {
        title: 'Example Domain',
        url: 'https://example.com',
        content: 'Example domain used in documentation and tests.',
        score: 0.92,
      },
      {
        title: 'IANA Example',
        url: 'https://www.iana.org/domains/reserved',
        content: 'IANA reserved domains documentation.',
        score: 0.87,
      },
    ];
  }
}

export async function runWebSearchServerTests() {
  const server = new FailingWebSearchServer();
  const handler = server.server._requestHandlers.get('tools/call');
  assert.equal(typeof handler, 'function', 'Expected call tool handler to be registered');

  const response = await handler(
    {
      jsonrpc: '2.0',
      id: '1',
      method: 'tools/call',
      params: {
        name: 'search',
        arguments: {
          query: 'parsing issue',
          limit: 2,
        },
      },
    },
    {}
  );

  assert.equal(response.isError, true, 'Expected handler to return an error response');
  assert.ok(Array.isArray(response.content) && response.content.length > 0, 'Expected error response to contain content');
  assert.match(response.content[0].text, /Internal search error/, 'Expected error message to describe internal failure');
  assert.equal(response.metadata?.code, ErrorCode.InternalError, 'Expected metadata to include the MCP error code');
  assert.equal(response.metadata?.context?.query, 'parsing issue');
  assert.equal(response.metadata?.context?.limit, 2);
  assert.equal(
    response.metadata?.context?.error?.message,
    'Failed to parse search results',
    'Expected serialized error message in metadata context'
  );

  const successServer = new SuccessfulWebSearchServer();
  const successHandler = successServer.server._requestHandlers.get('tools/call');
  assert.equal(
    typeof successHandler,
    'function',
    'Expected call tool handler to be registered for successful server'
  );

  const successResponse = await successHandler(
    {
      jsonrpc: '2.0',
      id: '2',
      method: 'tools/call',
      params: {
        name: 'search',
        arguments: {
          query: 'example query',
          limit: 1,
        },
      },
    },
    {}
  );

  assert.equal(Array.isArray(successResponse.content), true, 'Expected content array in response');
  assert.equal(
    successResponse.content[0]?.type,
    'text',
    'Expected textual response containing serialized results'
  );

  const parsed = JSON.parse(successResponse.content[0].text);
  assert.equal(Array.isArray(parsed), true, 'Expected serialized search result to be an array');
  assert.equal(parsed.length, 1, 'Expected sliced results to respect the requested limit');
  assert.equal(parsed[0].title, 'Example Domain');
  assert.equal(parsed[0].url, 'https://example.com');
  assert.equal(parsed[0].content, 'Example domain used in documentation and tests.');
  assert.equal(parsed[0].score, 0.92);
}
