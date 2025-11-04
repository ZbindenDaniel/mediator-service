import assert from 'node:assert/strict';
import { parseSearchResponse } from '../search/responseParser.js';

export async function runSearchWebTests() {
  const response = {
    content: [
      {
        type: 'json',
        data: [
          { title: 'Doc A', url: 'https://a.example.com', description: 'First document' },
          { title: 'Doc B', url: 'https://b.example.com', description: 'Second document' },
        ],
      },
    ],
  };

  const { text, sources } = parseSearchResponse(response, { query: 'example', limit: 1 });

  assert.match(text, /RESULTS for "example"/);
  assert.equal(sources.length, 1, 'Expected results to be capped to the limit');
  assert.equal(sources[0].title, 'Doc A');
  assert.equal(sources[0].url, 'https://a.example.com');

  const tavilyStyleResponse = {
    content: [
      {
        type: 'json',
        data: [
          { title: 'Tavily Doc', url: 'https://tavily.example.com', content: 'Tavily snippet text.' },
        ],
      },
    ],
  };

  const { text: tavilyText, sources: tavilySources } = parseSearchResponse(tavilyStyleResponse, {
    query: 'tavily example',
    limit: 5,
  });

  assert.match(tavilyText, /Tavily snippet text\./, 'Expected aggregated results block to include the Tavily snippet');
  assert.equal(tavilySources.length, 1, 'Expected Tavily-style payload to produce one source');
  assert.equal(
    tavilySources[0].description,
    'Tavily snippet text.',
    'Expected Tavily snippet to populate the description when missing in payload',
  );
}
