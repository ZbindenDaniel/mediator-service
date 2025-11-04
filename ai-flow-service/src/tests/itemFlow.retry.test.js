import assert from 'node:assert/strict';
import { formatSourcesForRetry } from '../utils/sourceFormatter.js';

function runTests() {
  const sources = [
    { title: 'Example Title', url: 'https://example.com', description: 'A useful description.' },
    { title: '  ', url: '', description: null },
  ];

  const formatted = formatSourcesForRetry(sources);
  assert(Array.isArray(formatted), 'formatted sources should be an array');
  assert.equal(formatted.length, sources.length, 'formatted sources length mismatch');
  assert(formatted[0].includes('Example Title'), 'first source should include title');
  assert(formatted[0].includes('https://example.com'), 'first source should include URL');
  assert(formatted[0].includes('A useful description.'), 'first source should include description');
  assert(formatted[1].includes('(no title)'), 'second source should note missing title');
  assert(formatted[1].includes('(no url)'), 'second source should note missing url');
  assert(formatted[1].includes('Description: (none)'), 'second source should note missing description');

  const joined = formatted.join('\n');
  assert(joined.includes('\nURL: '), 'joined sources should contain URL line breaks');

  const invalidFormatted = formatSourcesForRetry(['invalid']);
  assert(Array.isArray(invalidFormatted), 'invalid input should still return array');
  assert(invalidFormatted[0].includes('unavailable'), 'invalid source should be marked unavailable');

  const nonArrayFormatted = formatSourcesForRetry(null);
  assert.deepEqual(nonArrayFormatted, [], 'non-array input should return empty array');

  console.log('All formatSourcesForRetry tests passed.');
}

runTests();
