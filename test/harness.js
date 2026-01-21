const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('module');

// TODO: Extend this harness with additional Jest-compatible utilities as more
//       matcher coverage is required by future test suites.
// TODO(agent): Map out module mocking cleanup strategies if we broaden the Jest surface further.
// TODO(agent): Keep module alias resolution in sync with TypeScript path mappings to avoid drift during test loads.

const originalLoad = Module._load;
const originalResolveFilename = Module._resolveFilename;
const mockRegistry = new Map();
const trackedMocks = new Set();
const aliasResolvers = [
  (request) => {
    if (request === 'models') {
      return path.join(process.cwd(), 'models');
    }
    if (request.startsWith('models/')) {
      return path.join(process.cwd(), 'models', request.slice('models/'.length));
    }
    return null;
  }
];

function applyAlias(request) {
  for (const aliasResolver of aliasResolvers) {
    const aliasPath = aliasResolver(request);
    if (aliasPath) {
      return aliasPath;
    }
  }
  return null;
}

function findCallerModule() {
  // TODO(agent): Replace stack-based caller detection with explicit parent wiring if the harness grows.
  try {
    const originalPrepare = Error.prepareStackTrace;
    Error.prepareStackTrace = (_, structured) => structured;
    const stack = new Error().stack;
    Error.prepareStackTrace = originalPrepare;

    if (Array.isArray(stack)) {
      for (const frame of stack) {
        const framePath = frame?.getFileName();
        if (framePath && framePath !== __filename && !frame.isNative()) {
          return require.cache[framePath] || module;
        }
      }
    }
  } catch (error) {
    console.warn('[harness] Unable to resolve caller module; falling back to harness module', error);
  }

  if (module.parent) {
    return module.parent;
  }

  return module;
}

Module._resolveFilename = function resolveWithAliases(request, parent, isMain, options = {}) {
  const aliasPath = applyAlias(request);
  const candidate = aliasPath || request;
  const parentDir = parent?.filename ? path.dirname(parent.filename) : process.cwd();
  const searchPaths = Array.from(new Set([...(options.paths || []), parentDir, process.cwd()]));

  try {
    return originalResolveFilename.call(Module, candidate, parent, isMain, { ...options, paths: searchPaths });
  } catch (error) {
    if (aliasPath) {
      console.warn(`[harness] Alias resolution failed for ${request} -> ${aliasPath}`, error);
    }
    try {
      return originalResolveFilename.call(Module, request, parent, isMain, { ...options, paths: searchPaths });
    } catch (fallbackError) {
      console.warn(`[harness] Unable to resolve module ${request}`, fallbackError);
      throw fallbackError;
    }
  }
};

function resolveRequest(request, parentModule = module) {
  try {
    const aliasPath = applyAlias(request);
    if (aliasPath) {
      return require.resolve(aliasPath, { paths: [process.cwd()] });
    }
  } catch (aliasResolveError) {
    console.warn('[harness] Unexpected error while applying module aliases', aliasResolveError);
  }

  try {
    const baseDir = parentModule?.filename ? path.dirname(parentModule.filename) : process.cwd();
    return require.resolve(request, { paths: [baseDir, process.cwd()] });
  } catch (error) {
    console.warn(`[harness] Unable to resolve module ${request} for mocking`, error);
    return request;
  }
}

function trackMock(mockFn) {
  trackedMocks.add(mockFn);
  return mockFn;
}

function storeMockEntry(request, entry, parentModule = module) {
  const resolved = resolveRequest(request, parentModule);
  mockRegistry.set(resolved, entry);
  mockRegistry.set(request, entry);
  delete require.cache[resolved];
  return resolved;
}

function getMockEntry(request, parentModule) {
  const resolved = resolveRequest(request, parentModule);
  return mockRegistry.get(resolved) || mockRegistry.get(request);
}

function instantiateMock(entry, request) {
  if (!entry.instance) {
    try {
      entry.instance = entry.factory();
    } catch (error) {
      console.error(`[harness] Failed to instantiate mock for ${request}`, error);
      throw error;
    }
  }
  return entry.instance;
}

Module._load = function patchedLoad(request, parent, isMain) {
  const mockEntry = getMockEntry(request, parent);
  if (mockEntry) {
    return instantiateMock(mockEntry, request);
  }
  return originalLoad(request, parent, isMain);
};

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

const objectContainingTag = Symbol('objectContaining');

function logUnexpectedMatcherError(name, error) {
  if (!(error instanceof assert.AssertionError)) {
    console.error(`[harness] Matcher ${name} failed unexpectedly`, error);
  }
}

function createObjectContaining(sample) {
  return {
    [objectContainingTag]: true,
    sample
  };
}

function isObjectContaining(value) {
  return Boolean(value && value[objectContainingTag]);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function matchExpected(received, expected) {
  if (isObjectContaining(expected)) {
    return matchObjectContaining(received, expected.sample);
  }

  if (Array.isArray(expected)) {
    if (!Array.isArray(received) || received.length !== expected.length) {
      return false;
    }
    return expected.every((value, index) => matchExpected(received[index], value));
  }

  if (isPlainObject(expected)) {
    if (!isPlainObject(received)) {
      return false;
    }
    const expectedKeys = Object.keys(expected);
    const receivedKeys = Object.keys(received);
    if (expectedKeys.length !== receivedKeys.length) {
      return false;
    }
    return expectedKeys.every((key) => Object.prototype.hasOwnProperty.call(received, key)
      && matchExpected(received[key], expected[key]));
  }

  try {
    assert.deepStrictEqual(received, expected);
    return true;
  } catch (error) {
    return false;
  }
}

function matchObjectContaining(received, expectedSample) {
  if (!received || typeof received !== 'object') {
    return false;
  }
  const expectedKeys = Object.keys(expectedSample || {});
  return expectedKeys.every((key) => Object.prototype.hasOwnProperty.call(received, key)
    && matchExpected(received[key], expectedSample[key]));
}

function matchesThrown(thrown, expected) {
  if (expected === undefined) {
    return true;
  }
  const message = thrown && typeof thrown === 'object' && 'message' in thrown ? String(thrown.message) : String(thrown);
  if (typeof expected === 'string') {
    return message.includes(expected);
  }
  if (expected instanceof RegExp) {
    return expected.test(message);
  }
  if (expected instanceof Error) {
    return thrown === expected || message.includes(expected.message);
  }
  return false;
}

function assertThrowsMatch(received, expected) {
  if (typeof received !== 'function') {
    throw new assert.AssertionError({
      message: 'Expected a function to test toThrow'
    });
  }
  let thrown;
  try {
    received();
  } catch (error) {
    thrown = error;
  }
  if (!thrown) {
    throw new assert.AssertionError({
      message: 'Expected function to throw'
    });
  }
  if (!matchesThrown(thrown, expected)) {
    throw new assert.AssertionError({
      message: `Expected thrown error to match ${safeStringify(expected)}`
    });
  }
}

// TODO(agent): Revisit matcher parity once additional Jest-specific expectations are required.
function createMatchers() {
  return {
    toBe(received, expected) {
      assert.strictEqual(received, expected);
    },
    toEqual(received, expected) {
      try {
        if (!matchExpected(received, expected)) {
          throw new assert.AssertionError({
            message: `Expected ${safeStringify(received)} to equal ${safeStringify(expected)}`
          });
        }
      } catch (error) {
        logUnexpectedMatcherError('toEqual', error);
        throw error;
      }
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
    toHaveBeenCalledTimes(received, expected) {
      const mock = ensureMock(received, 'toHaveBeenCalledTimes');
      try {
        assert.strictEqual(mock.calls.length, expected, `Expected mock to have been called ${expected} times`);
      } catch (error) {
        logUnexpectedMatcherError('toHaveBeenCalledTimes', error);
        throw error;
      }
    },
    toHaveBeenCalledWith(received, ...expectedArgs) {
      const mock = ensureMock(received, 'toHaveBeenCalledWith');
      try {
        const found = mock.calls.some((call) => matchExpected(call, expectedArgs));
        if (!found) {
          throw new assert.AssertionError({
            message: `Expected mock to have been called with ${safeStringify(expectedArgs)}, but calls were ${safeStringify(mock.calls)}`
          });
        }
      } catch (error) {
        logUnexpectedMatcherError('toHaveBeenCalledWith', error);
        throw error;
      }
    },
    toThrow(received, expected) {
      try {
        assertThrowsMatch(received, expected);
      } catch (error) {
        logUnexpectedMatcherError('toThrow', error);
        throw error;
      }
    },
    toThrowError(received, expected) {
      try {
        assertThrowsMatch(received, expected);
      } catch (error) {
        logUnexpectedMatcherError('toThrowError', error);
        throw error;
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

expect.objectContaining = (sample) => {
  if (!sample || typeof sample !== 'object') {
    throw new TypeError('objectContaining expects a non-null object');
  }
  return createObjectContaining(sample);
};

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
  },
  mock(request, factory) {
    const factoryFn = typeof factory === 'function' ? factory : () => factory;
    const callerModule = findCallerModule();
    storeMockEntry(request, { factory: factoryFn, instance: null }, callerModule);
  },
  requireActual(request) {
    const callerModule = findCallerModule();
    const resolved = resolveRequest(request, callerModule);
    const mockEntry = getMockEntry(request, callerModule);
    mockRegistry.delete(resolved);
    mockRegistry.delete(request);
    const cached = require.cache[resolved];
    try {
      delete require.cache[resolved];
      return originalLoad(resolved, callerModule, false);
    } catch (error) {
      console.error(`[harness] Failed to require actual module for ${request}`, error);
      throw error;
    } finally {
      if (mockEntry) {
        storeMockEntry(request, mockEntry);
      }
      if (cached) {
        require.cache[resolved] = cached;
      } else {
        delete require.cache[resolved];
      }
    }
  },
  requireMock(request) {
    const entry = getMockEntry(request);
    if (!entry) {
      throw new Error(`[harness] No mock registered for ${request}`);
    }
    return instantiateMock(entry, request);
  },
  clearAllMocks() {
    for (const mockFn of trackedMocks) {
      if (typeof mockFn?.mockClear === 'function') {
        try {
          mockFn.mockClear();
        } catch (error) {
          console.error('[harness] Failed to clear mock state', error);
          throw error;
        }
      }
    }
  },
  resetAllMocks() {
    for (const mockFn of trackedMocks) {
      if (typeof mockFn?.mockReset === 'function') {
        try {
          mockFn.mockReset();
        } catch (error) {
          console.error('[harness] Failed to reset mock state', error);
          throw error;
        }
      } else if (typeof mockFn?.mockClear === 'function') {
        try {
          mockFn.mockClear();
        } catch (error) {
          console.error('[harness] Failed to clear mock state during reset', error);
          throw error;
        }
      }
    }
    for (const entry of new Set(mockRegistry.values())) {
      entry.instance = null;
    }
  },
  isolateModulesAsync: async (callback) => {
    const cachedEntries = new Map(Object.entries(require.cache));
    try {
      for (const key of Object.keys(require.cache)) {
        delete require.cache[key];
      }
      return await callback();
    } catch (error) {
      console.error('[harness] isolateModulesAsync callback failed', error);
      throw error;
    } finally {
      for (const key of Object.keys(require.cache)) {
        delete require.cache[key];
      }
      for (const [key, value] of cachedEntries.entries()) {
        require.cache[key] = value;
      }
    }
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
