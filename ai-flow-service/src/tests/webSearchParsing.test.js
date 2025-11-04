import assert from 'node:assert/strict';
import { WebSearchServer } from '../../web-search/index.js';

export async function runWebSearchParsingTests() {
  const server = new WebSearchServer();
  const originalPerformSearch = WebSearchServer.prototype.performSearch;
  const invocations = [];

  const handler = server.server._requestHandlers.get('tools/call');
  assert.equal(typeof handler, 'function', 'Expected call tool handler to be registered');

  try {
    WebSearchServer.prototype.performSearch = async function (query, maxResults) {
      invocations.push({ query, maxResults });
      if (query === 'classic') {
        return [
          {
            title: 'Result One',
            url: 'https://example.com/one',
            content: 'Snippet for the first result.',
            score: 0.92,
          },
        ];
      }
      if (query === 'alternative') {
        return [
          {
            title: 'Second Result',
            url: 'https://example.org/two',
            content: 'Additional snippet content.',
            score: 0.81,
          },
          {
            title: 'Third Result',
            url: 'https://example.net/three',
            score: undefined,
          },
        ];
      }
      if (query === 'score-mixed') {
        return [
          {
            title: 'String Score Result',
            url: 'https://example.com/string-score',
            content: 'Score provided as a string should be discarded.',
            score: '0.64',
          },
          {
            title: 'No Score Result',
            url: 'https://example.com/no-score',
            content: 'Missing score should default to null.',
          },
        ];
      }
      return [];
    };

    const callSearch = async (query, limit) => {
      const response = await handler(
        {
          jsonrpc: '2.0',
          id: `${query}-${limit}`,
          method: 'tools/call',
          params: {
            name: 'search',
            arguments: {
              query,
              limit,
            },
          },
        },
        {},
      );

      assert.ok(Array.isArray(response.content), 'Expected handler to return response content array');
      assert.equal(response.content[0]?.type, 'text', 'Expected textual response content');

      return JSON.parse(response.content[0].text);
    };

    const classicResults = await callSearch('classic', 5);
    assert.equal(classicResults.length, 1, 'Expected Tavily seam to return one result');
    assert.equal(classicResults[0].title, 'Result One');
    assert.equal(classicResults[0].url, 'https://example.com/one');
    assert.equal(classicResults[0].content, 'Snippet for the first result.');
    assert.equal(classicResults[0].score, 0.92);

    const alternativeResults = await callSearch('alternative', 3);
    assert.equal(
      alternativeResults.length,
      2,
      'Expected Tavily seam results to be passed through when within the limit',
    );

    const secondResult = alternativeResults.find((result) => result.url === 'https://example.org/two');
    assert.ok(secondResult, 'Expected to find the Tavily result for https://example.org/two');
    assert.equal(secondResult?.title, 'Second Result');
    assert.equal(secondResult?.content, 'Additional snippet content.');
    assert.equal(secondResult?.score, 0.81);

    const thirdResult = alternativeResults.find((result) => result.url === 'https://example.net/three');
    assert.ok(thirdResult, 'Expected to find the Tavily result for https://example.net/three');
    assert.equal(thirdResult?.title, 'Third Result');
    assert.equal(thirdResult?.content, '', 'Expected empty content when Tavily omits snippet');
    assert.equal(thirdResult?.score, null, 'Expected null score when Tavily omits score');

    const scoreMixedResults = await callSearch('score-mixed', 2);
    assert.equal(scoreMixedResults.length, 2, 'Expected mocked score results to be returned');

    const stringScoreResult = scoreMixedResults.find(
      (result) => result.url === 'https://example.com/string-score',
    );
    assert.ok(stringScoreResult, 'Expected to find the Tavily result with string score');
    assert.equal(
      stringScoreResult?.score,
      null,
      'Expected non-numeric Tavily score to be normalized to null',
    );
    assert.equal(
      stringScoreResult?.content,
      'Score provided as a string should be discarded.',
      'Expected snippet content to be preserved when score is dropped',
    );

    const missingScoreResult = scoreMixedResults.find(
      (result) => result.url === 'https://example.com/no-score',
    );
    assert.ok(missingScoreResult, 'Expected to find the Tavily result missing score');
    assert.equal(missingScoreResult?.score, null, 'Expected missing Tavily score to default to null');
    assert.equal(
      missingScoreResult?.content,
      'Missing score should default to null.',
      'Expected snippet content to be propagated when score is missing',
    );

    assert.deepEqual(
      invocations,
      [
        { query: 'classic', maxResults: 5 },
        { query: 'alternative', maxResults: 3 },
        { query: 'score-mixed', maxResults: 2 },
      ],
      'Expected Tavily seam to be invoked with query and limit arguments',
    );
  } finally {
    WebSearchServer.prototype.performSearch = originalPerformSearch;
  }
}
