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

function createDeferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

export async function runApiCancelTests() {
  let helperCalls = 0;
  let runStarted;
  await withServer(
    async (server) => {
      runStarted = createDeferred();
      const runResponsePromise = server.inject({
        method: 'POST',
        url: '/run',
        payload: { itemUUid: 'cancel-123', Artikelbeschreibung: 'Produkt' },
      });

      await runStarted.promise;

      const cancelResponse = await server.inject({
        method: 'POST',
        url: '/run/cancel',
        payload: { itemUUid: 'cancel-123', actor: 'qa-tester' },
      });

      assert.equal(cancelResponse.statusCode, 200);
      const cancelBody = cancelResponse.json();
      assert.equal(cancelBody.status, 'CANCELLATION_REQUESTED');
      assert.equal(cancelBody.itemId, 'cancel-123');
      assert.equal(cancelBody.actor, 'qa-tester');
      assert.equal(cancelBody.previousOutcome, null);
      assert.equal(cancelBody.requestedBy, 'qa-tester');
      assert(cancelBody.message.includes('Cancellation requested'));

      const runResponse = await runResponsePromise;
      assert.equal(runResponse.statusCode, 409);
      const runBody = runResponse.json();
      assert.equal(runBody.error, 'RUN_CANCELLED');
      assert(runBody.message.toLowerCase().includes('cancel'));
      assert.equal(helperCalls, 0, 'trigger failure helper should not be invoked on successful cancellation');
    },
    {
      runItemFlowOverride: async (item, id, options) => {
        assert.equal(id, 'cancel-123');
        assert.equal(item.itemUUid, 'cancel-123');
        assert.equal(options.search, 'Produkt');
        assert(options.cancellationSignal instanceof AbortSignal, 'cancellation signal should be provided');
        runStarted.resolve();

        const signal = options.cancellationSignal;
        const responseBody = {
          itemId: id,
          status: 'completed',
          error: null,
          needsReview: false,
          summary: 'done',
          reviewDecision: 'approved',
          reviewNotes: null,
          reviewedBy: 'unit-test',
          actor: 'unit-test',
          item: { itemUUid: id, Artikelbeschreibung: item.Artikelbeschreibung, searchQuery: options.search },
        };

        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            cleanup();
            resolve(responseBody);
          }, 5000);

          function cleanup() {
            clearTimeout(timer);
            if (signal?.removeEventListener) {
              signal.removeEventListener('abort', onAbort);
            }
          }

          function onAbort() {
            cleanup();
            reject(signal?.reason ?? new FlowError('RUN_CANCELLED', 'Cancelled', 409));
          }

          if (signal) {
            if (signal.aborted) {
              onAbort();
              return;
            }
            signal.addEventListener('abort', onAbort, { once: true });
          }
        });

        return responseBody;
      },
      triggerFailureOverride: async () => {
        helperCalls += 1;
        return null;
      },
    },
  );

  let missingIdHelperCalls = 0;
  await withServer(
    async (server) => {
      const response = await server.inject({ method: 'POST', url: '/run/cancel', payload: {} });
      assert.equal(response.statusCode, 400);
      const body = response.json();
      assert.equal(body.error, 'INVALID_BODY');
      assert(Array.isArray(body.details.formErrors));
      assert.equal(missingIdHelperCalls, 0, 'helper should not run when payload invalid');
    },
    {
      triggerFailureOverride: async () => {
        missingIdHelperCalls += 1;
        return null;
      },
    },
  );

  const helperPayloads = [];
  await withServer(
    async (server) => {
      const response = await server.inject({
        method: 'POST',
        url: '/run/cancel',
        payload: { itemUUid: '  missing-run  ' },
      });

      assert.equal(response.statusCode, 404);
      const body = response.json();
      assert.equal(body.error, 'CANCELLATION_FAILED');
      assert.equal(body.status, 'NOT_FOUND');
      assert(body.message.includes('No in-flight run'));
    },
    {
      triggerFailureOverride: async (payload) => {
        helperPayloads.push(payload);
        return null;
      },
    },
  );

  assert.equal(helperPayloads.length, 1, 'trigger failure helper should be invoked for missing run');
  const [payload] = helperPayloads;
  assert.equal(payload.itemId, 'missing-run');
  const expectedActor =
    typeof process.env.AGENT_ACTOR_ID === 'string' && process.env.AGENT_ACTOR_ID.trim().length
      ? process.env.AGENT_ACTOR_ID.trim()
      : 'item-flow-service';
  assert.equal(payload.actor, expectedActor);
  assert(payload.labels.includes('cancellation_failed'));
  assert(payload.labels.includes('cancellation_status:not_found'));
}
