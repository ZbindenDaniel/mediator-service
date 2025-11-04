import assert from 'node:assert/strict';

export async function runExternalApiTests() {
  const module = await import('../utils/externalApi.js');

  const payload = {
    itemId: 'item-123',
    status: 'completed',
    error: null,
    needsReview: false,
    summary: 'done',
    reviewDecision: 'approved',
    reviewNotes: null,
    reviewedBy: 'supervisor-agent',
    actor: 'unit-test-agent',
    item: {
      itemUUid: 'item-123',
      Artikelbeschreibung: 'Produkt',
      searchQuery: 'Produkt',
    },
  };

  {
    const originalFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (input, init = {}) => {
      calls.push({ input, init });
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => '',
      };
    };

    try {
      await module.sendToExternal(payload);
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.equal(calls.length, 1, 'fetch should be called exactly once');
    const [{ input, init }] = calls;
    assert.equal(
      input,
      'http://127.0.0.1:9999/api/agentic/items/item-123/result',
      'should target the callback endpoint for the given item',
    );
    assert(init, 'fetch init options should be provided');
    assert.equal(init.method, 'POST');
    assert(init.headers, 'headers should be provided');
    assert.equal(init.headers['Content-Type'], 'application/json');
    assert.equal(init.headers['x-agent-secret'], 'test-secret');

    const parsedBody = JSON.parse(init.body);
    assert.deepEqual(parsedBody, payload, 'the payload should be forwarded unmodified');
  }

  {
    const originalFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (input, init = {}) => {
      calls.push({ input, init });
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => JSON.stringify({ status: 'failed', reason: 'captured' }),
      };
    };

    let response;
    try {
      response = await module.triggerAgenticFailure({
        itemId: 'item-123',
        actor: ' custom-actor ',
        labels: ['failure', 'failure', '  extra  '],
        searchTerm: ' Produkt ',
        statusCode: 400,
        responseBody: { status: 'SKIPPED' },
        errorMessage: 'failed to start',
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.equal(calls.length, 1, 'trigger failure should perform exactly one request');
    const [{ input, init }] = calls;
    assert.equal(
      input,
      'http://127.0.0.1:9999/api/items/item-123/agentic/trigger-failure',
      'should target the trigger failure endpoint for the given item',
    );
    assert(init, 'trigger failure init options should be provided');
    assert.equal(init.method, 'POST');
    assert(init.headers, 'trigger failure headers should be provided');
    assert.equal(init.headers['Content-Type'], 'application/json');
    assert.equal(init.headers['x-agent-secret'], 'test-secret');

    const parsedBody = JSON.parse(init.body);
    assert.deepEqual(parsedBody, {
      actor: 'custom-actor',
      labels: ['failure', 'extra'],
      searchTerm: 'Produkt',
      statusCode: 400,
      responseBody: { status: 'SKIPPED' },
      errorMessage: 'failed to start',
    });

    assert.deepEqual(response, { status: 'failed', reason: 'captured' });
  }
}
