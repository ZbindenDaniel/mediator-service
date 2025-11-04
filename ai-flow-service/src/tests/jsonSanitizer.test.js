import assert from 'node:assert/strict';
import { parseJsonWithSanitizer, sanitizeJsonInput } from '../utils/json.js';

function createStubLogger() {
  const entries = [];
  return {
    debug(payload) {
      entries.push(payload);
    },
    entries,
  };
}

export async function runJsonSanitizerTests() {
  {
    const logger = createStubLogger();
    const clean = sanitizeJsonInput('{"foo":1}', { loggerInstance: logger });
    assert.equal(clean, '{"foo":1}');
    assert.equal(logger.entries.length, 0, 'clean json should not trigger sanitizer logs');
  }

  {
    const logger = createStubLogger();
    const parsed = parseJsonWithSanitizer('```json\n{ "foo": 2 }\n```', {
      loggerInstance: logger,
      context: { case: 'fenced' },
    });
    assert.deepEqual(parsed, { foo: 2 }, 'fenced json should be parsed after removing code fences');
    assert.equal(logger.entries.length, 1, 'fenced json should log cleanup');
    assert(logger.entries[0].actions.includes('removed-code-fence'), 'cleanup should include code fence removal');
  }

  {
    const logger = createStubLogger();
    const parsed = parseJsonWithSanitizer('Preface before json {"foo":3}\nThanks!', {
      loggerInstance: logger,
      context: { case: 'prefixed' },
    });
    assert.deepEqual(parsed, { foo: 3 }, 'prefixed json should parse after extraction');
    assert.equal(logger.entries.length, 1, 'prefixed json should trigger cleanup log');
    assert(logger.entries[0].actions.includes('extracted-braced-substring'), 'cleanup should note substring extraction');
  }
}
