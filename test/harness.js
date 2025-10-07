const assert = require('node:assert/strict');

// TODO: Extend this harness with additional Jest-compatible utilities as more
//       matcher coverage is required by future test suites.

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

const it = test;

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch (error) {
    console.warn('[harness] Failed to stringify value for assertion message', error);
    return String(value);
  }
}

function ensureMock(received, matcherName) {
  if (!received || typeof received !== 'function' || !received.mock || !Array.isArray(received.mock.calls)) {
    throw new assert.AssertionError({
      message: `Expected a jest mock function for ${matcherName}`
    });
  }
  return received.mock;
}

function createMatchers() {
  return {
    toBe(received, expected) {
      assert.strictEqual(received, expected);
    },
    toEqual(received, expected) {
      assert.deepStrictEqual(received, expected);
    },
    toMatch(received, regex) {
      if (!regex.test(String(received))) {
        throw new assert.AssertionError({
          message: `Expected ${received} to match ${regex}`
        });
      }
    },
    toBeGreaterThan(received, expected) {
      if (!(received > expected)) {
        throw new assert.AssertionError({
          message: `Expected ${received} to be greater than ${expected}`
        });
      }
    },
    toBeNull(received) {
      assert.strictEqual(received, null);
    },
    toContain(received, sub) {
      if (typeof received?.includes !== 'function') {
        throw new assert.AssertionError({
          message: `Received value does not support containment checks`
        });
      }
      if (!received.includes(sub)) {
        throw new assert.AssertionError({
          message: `Expected ${received} to contain ${sub}`
        });
      }
    },
    toBeUndefined(received) {
      assert.strictEqual(received, undefined);
    },
    toBeDefined(received) {
      assert.notStrictEqual(received, undefined);
    },
    toBeTruthy(received) {
      assert.ok(received, `Expected ${received} to be truthy`);
    },
    toBeFalsy(received) {
      assert.ok(!received, `Expected ${received} to be falsy`);
    },
    toHaveBeenCalled(received) {
      const mock = ensureMock(received, 'toHaveBeenCalled');
      assert.ok(mock.calls.length > 0, 'Expected mock to have been called at least once');
    },
    toHaveBeenCalledWith(received, ...expectedArgs) {
      const mock = ensureMock(received, 'toHaveBeenCalledWith');
      const found = mock.calls.some((call) => {
        try {
          assert.deepStrictEqual(call, expectedArgs);
          return true;
        } catch (error) {
          return false;
        }
      });
      if (!found) {
        throw new assert.AssertionError({
          message: `Expected mock to have been called with ${safeStringify(expectedArgs)}, but calls were ${safeStringify(mock.calls)}`
        });
      }
    }
  };
}

function expect(received) {
  const matchers = createMatchers();
  const expectation = {};
  const notExpectation = {};

  for (const [name, matcher] of Object.entries(matchers)) {
    expectation[name] = (...args) => matcher(received, ...args);
    notExpectation[name] = (...args) => {
      try {
        matcher(received, ...args);
      } catch (error) {
        return;
      }
      throw new assert.AssertionError({
        message: `Expected value ${safeStringify(received)} to not satisfy matcher ${name}`
      });
    };
  }

  expectation.not = notExpectation;
  return expectation;
}

function createMockFunction(implementation = () => undefined, restoreCallback = null) {
  const state = {
    implementation,
    defaultImplementation: implementation,
    calls: [],
    instances: [],
    results: []
  };

  const mockFn = function mockFunction(...args) {
    state.calls.push(args);
    state.instances.push(this);
    try {
      const result = state.implementation.apply(this, args);
      state.results.push({ type: 'return', value: result });
      return result;
    } catch (error) {
      state.results.push({ type: 'throw', value: error });
      throw error;
    }
  };

  mockFn.mock = state;

  mockFn.mockImplementation = (fn) => {
    if (typeof fn !== 'function') {
      throw new TypeError('mockImplementation expects a function');
    }
    state.implementation = fn;
    return mockFn;
  };

  mockFn.mockReturnValue = (value) => {
    state.implementation = () => value;
    return mockFn;
  };

  mockFn.mockResolvedValue = (value) => {
    state.implementation = () => Promise.resolve(value);
    return mockFn;
  };

  mockFn.mockRejectedValue = (value) => {
    state.implementation = () => Promise.reject(value);
    return mockFn;
  };

  mockFn.mockClear = () => {
    state.calls.length = 0;
    state.instances.length = 0;
    state.results.length = 0;
    return mockFn;
  };

  mockFn.mockReset = () => {
    mockFn.mockClear();
    state.implementation = state.defaultImplementation;
    return mockFn;
  };

  mockFn.mockRestore = () => {
    state.implementation = state.defaultImplementation;
    if (restoreCallback) {
      try {
        restoreCallback();
      } catch (error) {
        console.error('[harness] Failed to restore original implementation', error);
        throw error;
      }
    }
    return mockFn;
  };

  return mockFn;
}

const jestApi = {
  fn(implementation) {
    if (implementation && typeof implementation !== 'function') {
      throw new TypeError('jest.fn() implementation must be a function');
    }
    return createMockFunction(implementation || (() => undefined));
  },
  spyOn(target, method) {
    if (!target) {
      throw new TypeError('Cannot spyOn on undefined or null target');
    }
    if (typeof method !== 'string') {
      throw new TypeError('spyOn second argument must be a method name');
    }
    const original = target[method];
    if (typeof original !== 'function') {
      throw new TypeError(`Property ${method} is not a function`);
    }
    const restore = () => {
      target[method] = original;
    };
    const spy = createMockFunction(function (...args) {
      return original.apply(this, args);
    }, restore);
    target[method] = spy;
    return spy;
  }
};

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
  it,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  expect,
  runSuite,
  rootSuite,
  jest: jestApi
};
