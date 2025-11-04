import assert from 'node:assert/strict';
import { stringifyLangChainContent } from '../utils/langchain.js';

export function runLangchainUtilsTests() {
  const stringContent = '{"foo":"bar"}';
  const stringResult = stringifyLangChainContent(stringContent, { context: 'test.string' });
  assert.equal(stringResult, stringContent, 'string content should round-trip');

  const arrayContent = [
    { type: 'text', text: '{"foo":' },
    { type: 'tool_use', name: 'mock_tool', input: { query: 'ignored' } },
    { type: 'text', text: '"value"}' },
  ];
  const arrayResult = stringifyLangChainContent(arrayContent, { context: 'test.array' });
  assert.equal(arrayResult, '{"foo":"value"}', 'array content should join text segments and skip tools');

  const jsonContent = { type: 'json', data: { foo: 'bar', count: 2 } };
  const jsonResult = stringifyLangChainContent(jsonContent, { context: 'test.json' });
  assert(jsonResult.includes('"foo"'), 'json content should include serialized keys');
  assert(jsonResult.includes('"bar"'), 'json content should include serialized values');

  const nestedContent = {
    content: [
      { type: 'text', text: 'Hello' },
      { text: ' ' },
      { content: { type: 'text', text: 'world!' } },
    ],
  };
  const nestedResult = stringifyLangChainContent(nestedContent, { context: 'test.nested' });
  assert.equal(nestedResult, 'Hello world!', 'nested content should be flattened');

  const resilientContent = [
    { type: 'unsupported', payload: { value: 123 } },
    null,
    undefined,
    { type: 'text', text: 'ok' },
  ];
  let resilientResult = '';
  assert.doesNotThrow(() => {
    resilientResult = stringifyLangChainContent(resilientContent, { context: 'test.resilient' });
  });
  assert.equal(resilientResult.endsWith('ok'), true, 'resilient content should still return available text');

  console.log('LangChain content helper tests passed.');
}
