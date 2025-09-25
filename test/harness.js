const assert = require('node:assert/strict');

function createSuite(name, parent = null) {
  return {
    name,
    parent,
    tests: [],
    beforeAll: [],
    afterAll: [],
    beforeEach: [],
    afterEach: [],
    children: []
  };
}

const rootSuite = createSuite('root');
let currentSuite = rootSuite;

function describe(name, fn) {
  const parent = currentSuite;
  const suite = createSuite(name, parent);
  parent.children.push(suite);
  currentSuite = suite;
  try {
    fn();
  } finally {
    currentSuite = parent;
  }
}

function registerHook(store, fn) {
  store.push(fn);
}

function beforeAll(fn) {
  registerHook(currentSuite.beforeAll, fn);
}

function afterAll(fn) {
  registerHook(currentSuite.afterAll, fn);
}

function beforeEach(fn) {
  registerHook(currentSuite.beforeEach, fn);
}

function afterEach(fn) {
  registerHook(currentSuite.afterEach, fn);
}

function test(name, fn) {
  currentSuite.tests.push({ name, fn });
}

function expect(received) {
  return {
    toBe(expected) {
      assert.strictEqual(received, expected);
    },
    toEqual(expected) {
      assert.deepStrictEqual(received, expected);
    },
    toMatch(regex) {
      if (!regex.test(String(received))) {
        throw new assert.AssertionError({
          message: `Expected ${received} to match ${regex}`
        });
      }
    },
    toBeGreaterThan(expected) {
      if (!(received > expected)) {
        throw new assert.AssertionError({
          message: `Expected ${received} to be greater than ${expected}`
        });
      }
    },
    toBeNull() {
      assert.strictEqual(received, null);
    },
    toContain(sub) {
      if (!received.includes(sub)) {
        throw new assert.AssertionError({
          message: `Expected ${received} to contain ${sub}`
        });
      }
    }
  };
}

async function runSuite(suite, depth = 0, results = { passed: 0, failed: 0, details: [] }) {
  for (const hook of suite.beforeAll) {
    await hook();
  }

  for (const child of suite.children) {
    await runSuite(child, depth + 1, results);
  }

  for (const testCase of suite.tests) {
    for (const hook of suite.beforeEach) {
      await hook();
    }
    try {
      await testCase.fn();
      results.passed += 1;
      results.details.push({ suite: suite.name, name: testCase.name, status: 'passed' });
      console.log(`✓ ${testCase.name}`);
    } catch (err) {
      results.failed += 1;
      results.details.push({ suite: suite.name, name: testCase.name, status: 'failed', error: err });
      console.error(`✗ ${testCase.name}`);
      console.error(err);
    } finally {
      for (const hook of suite.afterEach) {
        await hook();
      }
    }
  }

  for (const hook of suite.afterAll) {
    await hook();
  }

  if (depth === 0) {
    const summary = `${results.passed} passed, ${results.failed} failed`;
    if (results.failed > 0) {
      throw new Error(summary);
    } else {
      console.log(summary);
    }
  }

  return results;
}

module.exports = {
  describe,
  test,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  expect,
  runSuite,
  rootSuite
};
