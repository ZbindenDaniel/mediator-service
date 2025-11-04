import assert from 'node:assert/strict';
import { FlowError } from '../flow/itemFlow.js';

process.env.DB_PATH = process.env.DB_PATH || ':memory:';

let serverModulePromise;
function getServerModule() {
  if (!serverModulePromise) {
    serverModulePromise = import('../api.js');
  }
  return serverModulePromise;
}

async function withServer(run, { runItemFlowOverride, triggerFailureOverride } = {}) {
  const { buildServer } = await getServerModule();

  if (typeof runItemFlowOverride === 'function') {
    globalThis.__RUN_ITEM_FLOW_OVERRIDE__ = runItemFlowOverride;
  } else {
    delete globalThis.__RUN_ITEM_FLOW_OVERRIDE__;
  }

  if (typeof triggerFailureOverride === 'function') {
    globalThis.__TRIGGER_FAILURE_OVERRIDE__ = triggerFailureOverride;
  } else {
    delete globalThis.__TRIGGER_FAILURE_OVERRIDE__;
  }

  const server = await buildServer();
  try {
    await run(server);
  } finally {
    delete globalThis.__RUN_ITEM_FLOW_OVERRIDE__;
    delete globalThis.__TRIGGER_FAILURE_OVERRIDE__;
    await server.close();
  }
}

export async function runApiRunTests() {
  const { modelConfig } = await import('../config/index.js');

  const responseBody = {
    itemId: 'abc-123',
    status: 'completed',
    error: null,
    needsReview: false,
    summary: 'extraction complete',
    reviewDecision: 'approved',
    reviewNotes: 'unit-test',
    reviewedBy: 'unit-supervisor',
    actor: 'unit-test-agent',
    item: {
      itemUUid: 'abc-123',
      Artikelbeschreibung: 'Produkt',
      Marktpreis: null,
      Kurzbeschreibung: 'Kurz',
      Langtext: 'Lang',
      Hersteller: 'Test GmbH',
      Länge_mm: null,
      Breite_mm: null,
      Höhe_mm: null,
      Gewicht_kg: null,
      searchQuery: 'Produkt',
    },
  };

  let receivedArgs = null;
  let triggerFailureCalls = 0;
  await withServer(
    async (server) => {
      const response = await server.inject({
        method: 'POST',
        url: '/run',
        payload: { itemUUid: ' abc-123 ', Artikelbeschreibung: ' Produkt ' },
      });

      assert.equal(response.statusCode, 200);
      const body = response.json();
      assert.deepEqual(body, responseBody);
      assert(receivedArgs, 'runItemFlow override should be invoked');
      assert.equal(receivedArgs.id, 'abc-123');
      assert.equal(receivedArgs.item.itemUUid, 'abc-123');
      assert.equal(receivedArgs.item.Artikelbeschreibung, 'Produkt');
      assert.equal(receivedArgs.options.search, 'Produkt');
    },
    {
      runItemFlowOverride: async (item, id, options) => {
        receivedArgs = { item, id, options };
        return responseBody;
      },
      triggerFailureOverride: async () => {
        triggerFailureCalls += 1;
        return null;
      },
    },
  );
  assert.equal(triggerFailureCalls, 0, 'trigger failure helper should not be invoked on success');

  await withServer(
    async (server) => {
    const response = await server.inject({
      method: 'POST',
      url: '/run',
      payload: { Artikelbeschreibung: 'Feuerlöscher' },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.status, 'SKIPPED');
    assert(body.reason.includes('itemUUid'));
    assert.deepEqual(body.details.missingFields, ['itemUUid']);
    },
    {
      triggerFailureOverride: async () => {
        triggerFailureCalls += 1;
        return null;
      },
    },
  );
  assert.equal(triggerFailureCalls, 0, 'trigger failure helper should not be invoked without item id');

  let missingFieldFailurePayloads = [];
  await withServer(
    async (server) => {
    const response = await server.inject({
      method: 'POST',
      url: '/run',
      payload: { itemUUid: 'item-789', Artikelbeschreibung: '    ' },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.status, 'SKIPPED');
    assert(body.reason.includes('Artikelbeschreibung'));
    assert.deepEqual(body.details.missingFields, ['Artikelbeschreibung']);
    },
    {
      triggerFailureOverride: async (payload) => {
        missingFieldFailurePayloads.push(payload);
        return null;
      },
    },
  );
  assert.equal(missingFieldFailurePayloads.length, 1, 'trigger failure helper should be invoked for missing Artikelbeschreibung');
  assert.deepEqual(missingFieldFailurePayloads[0].labels, [
    'preflight_skipped',
    'missing:Artikelbeschreibung',
  ]);

  const originalProvider = modelConfig.provider;
  const originalOpenAiConfig = { ...modelConfig.openai };
  modelConfig.provider = 'openai';
  modelConfig.openai.apiKey = undefined;
  modelConfig.openai.model = undefined;
  modelConfig.openai.baseUrl = undefined;

  const helperResponses = [];
  try {
    await withServer(
      async (server) => {
        const response = await server.inject({
          method: 'POST',
          url: '/run',
          payload: { itemUUid: 'abc-123', Artikelbeschreibung: 'Produkt' },
        });

        assert.equal(response.statusCode, 200);
        const body = response.json();
        assert.equal(body.status, 'SKIPPED');
        assert(body.reason.toLowerCase().includes('openai'));
        assert.deepEqual(body.details.issues, ['OPENAI_API_KEY', 'OPENAI_MODEL']);
        assert.deepEqual(body.details.refreshedSnapshot, {
          status: 'failed',
          reason: 'helper-snapshot',
        });
      },
      {
        runItemFlowOverride: async () => {
          throw new Error('runItemFlow should not execute when configuration is missing');
        },
        triggerFailureOverride: async (payload) => {
          helperResponses.push(payload);
          return { status: 'failed', reason: 'helper-snapshot' };
        },
      },
    );
  } finally {
    modelConfig.provider = originalProvider;
    modelConfig.openai.apiKey = originalOpenAiConfig.apiKey;
    modelConfig.openai.model = originalOpenAiConfig.model;
    modelConfig.openai.baseUrl = originalOpenAiConfig.baseUrl;
  }

  assert.equal(helperResponses.length, 1, 'trigger failure helper should run when configuration is missing');
  const [configFailurePayload] = helperResponses;
  assert.equal(configFailurePayload.itemId, 'abc-123');
  assert.equal(configFailurePayload.actor, 'item-flow-service');
  assert.equal(configFailurePayload.searchTerm, 'Produkt');
  assert.equal(configFailurePayload.statusCode, 400);
  assert(configFailurePayload.errorMessage.includes('Missing OpenAI configuration'));
  assert.deepEqual(configFailurePayload.responseBody, {
    status: 'SKIPPED',
    reason: configFailurePayload.errorMessage,
    details: { issues: ['OPENAI_API_KEY', 'OPENAI_MODEL'] },
  });
  assert.deepEqual(configFailurePayload.labels, [
    'preflight_skipped',
    'configuration_missing',
    'issue:OPENAI_API_KEY',
    'issue:OPENAI_MODEL',
  ]);

  const failurePayloads = [];
  await withServer(
    async (server) => {
      const response = await server.inject({
        method: 'POST',
        url: '/run',
        payload: { itemUUid: 'abc-123', Artikelbeschreibung: 'Produkt' },
      });

      assert.equal(response.statusCode, 400);
      const body = response.json();
      assert.equal(body.error, 'INVALID_TARGET');
      assert.equal(body.message, 'Target requires a non-empty "Artikelbeschreibung"');
      assert.deepEqual(body.refreshedSnapshot, { status: 'failed', reason: 'flow-error-snapshot' });
    },
    {
      runItemFlowOverride: async () => {
        throw new FlowError('INVALID_TARGET', 'Target requires a non-empty "Artikelbeschreibung"', 400);
      },
      triggerFailureOverride: async (payload) => {
        failurePayloads.push(payload);
        return { status: 'failed', reason: 'flow-error-snapshot' };
      },
    },
  );

  assert.equal(failurePayloads.length, 1, 'trigger failure helper should run when runItemFlow rejects');
  const [flowErrorPayload] = failurePayloads;
  assert.equal(flowErrorPayload.itemId, 'abc-123');
  assert.equal(flowErrorPayload.actor, 'item-flow-service');
  assert.equal(flowErrorPayload.searchTerm, 'Produkt');
  assert.equal(flowErrorPayload.statusCode, 400);
  assert.equal(flowErrorPayload.errorMessage, 'Target requires a non-empty "Artikelbeschreibung"');
  assert.deepEqual(flowErrorPayload.responseBody, {
    error: 'INVALID_TARGET',
    message: 'Target requires a non-empty "Artikelbeschreibung"',
  });
  assert.deepEqual(flowErrorPayload.labels, ['run_failed', 'flow_error:INVALID_TARGET']);
}
