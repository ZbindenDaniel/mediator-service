// src/api.js
import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import { z } from './utils/zod.js';
import { logger as appLogger } from './utils/logger.js';
import { runItemFlow, FlowError } from './flow/itemFlow.js';
import { beginRun, requestCancellation } from './flow/cancellation.js';
import { logRequestStart, logRequestEnd } from './utils/db.js';
import { modelConfig } from './config/index.js';
import { triggerAgenticFailure } from './utils/externalApi.js';

const itemPayloadSchema = {
  type: 'object',
  description: 'Current item payload that will be enriched.',
  additionalProperties: true,
  properties: {
    Artikelbeschreibung: { type: 'string' },
    itemUUid: { type: 'string' },
  },
};

const runRequestBodySchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    item: itemPayloadSchema,
    Artikelbeschreibung: { type: 'string' },
    itemUUid: { type: 'string' },
  },
};

const sourceSchema = {
  type: 'object',
  required: ['title', 'url'],
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    url: { type: 'string', format: 'uri' },
    description: { type: 'string' },
  },
};

const runSuccessResponseSchema = {
  type: 'object',
  required: [
    'itemId',
    'status',
    'error',
    'needsReview',
    'summary',
    'reviewDecision',
    'reviewNotes',
    'reviewedBy',
    'actor',
    'item',
  ],
  additionalProperties: true,
  properties: {
    itemId: { type: 'string' },
    status: { type: 'string' },
    error: { type: ['string', 'null'] },
    needsReview: { type: 'boolean' },
    summary: { type: 'string' },
    reviewDecision: { type: 'string' },
    reviewNotes: { type: ['string', 'null'] },
    reviewedBy: { type: ['string', 'null'] },
    actor: { type: 'string' },
    item: {
      type: 'object',
      additionalProperties: true,
      properties: {
        itemUUid: { type: 'string' },
        searchQuery: { type: 'string' },
        sources: {
          type: 'array',
          items: sourceSchema,
        },
      },
    },
  },
};

const runSkippedResponseSchema = {
  type: 'object',
  required: ['status', 'reason'],
  additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['SKIPPED'] },
    reason: { type: 'string' },
    details: {
      type: 'object',
      additionalProperties: true,
    },
  },
};

const runCancelRequestBodySchema = {
  type: 'object',
  required: ['itemUUid'],
  additionalProperties: true,
  properties: {
    itemUUid: { type: 'string' },
    actor: { type: 'string' },
  },
};

const runCancelSuccessResponseSchema = {
  type: 'object',
  required: ['status', 'itemId', 'actor'],
  additionalProperties: true,
  properties: {
    status: { type: 'string', enum: ['CANCELLATION_REQUESTED'] },
    itemId: { type: 'string' },
    actor: { type: 'string' },
    message: { type: 'string' },
    requestedBy: { type: 'string' },
    previousOutcome: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: true,
          properties: {
            outcome: { type: 'string' },
            details: { type: 'object', additionalProperties: true },
            finishedAt: { type: 'number' },
            actor: { type: ['string', 'null'] },
            startedAt: { type: ['number', 'null'] },
            cancelRequestedAt: { type: ['number', 'null'] },
          },
        },
      ],
    },
  },
};

const runCancelErrorResponseSchema = {
  type: 'object',
  required: ['error', 'message', 'status'],
  additionalProperties: true,
  properties: {
    error: { type: 'string' },
    message: { type: 'string' },
    status: { type: 'string' },
  },
};

function resolveModelConfigurationIssues() {
  const provider = modelConfig?.provider;

  if (!provider) {
    return { reason: 'Model provider is not configured', issues: ['MODEL_PROVIDER'] };
  }

  if (provider === 'ollama') {
    const missing = [];
    if (!modelConfig?.ollama?.baseUrl) {
      missing.push('OLLAMA_BASE_URL');
    }
    if (!modelConfig?.ollama?.model) {
      missing.push('OLLAMA_MODEL');
    }
    if (missing.length) {
      return {
        reason: `Missing Ollama configuration: ${missing.join(', ')}`,
        issues: missing,
      };
    }
    return null;
  }

  if (provider === 'openai') {
    const missing = [];
    const apiKey = modelConfig?.openai?.apiKey ?? modelConfig?.apiKey;
    const model = modelConfig?.openai?.model ?? modelConfig?.model;
    if (!apiKey) {
      missing.push('OPENAI_API_KEY');
    }
    if (!model) {
      missing.push('OPENAI_MODEL');
    }
    if (missing.length) {
      return {
        reason: `Missing OpenAI configuration: ${missing.join(', ')}`,
        issues: missing,
      };
    }
    return null;
  }

  return {
    reason: `Unsupported model provider: ${provider}`,
    issues: [`MODEL_PROVIDER:${provider}`],
  };
}

const validationErrorResponseSchema = {
  type: 'object',
  required: ['error', 'details'],
  additionalProperties: false,
  properties: {
    error: { type: 'string', enum: ['INVALID_BODY'] },
    message: { type: 'string' },
    details: {
      type: 'object',
      required: ['fieldErrors', 'formErrors'],
      additionalProperties: false,
      properties: {
        fieldErrors: {
          type: 'object',
          additionalProperties: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        formErrors: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
  },
};

const errorResponseSchema = {
  type: 'object',
  required: ['error', 'message'],
  additionalProperties: false,
  properties: {
    error: { type: 'string' },
    message: { type: 'string' },
    refreshedSnapshot: {
      anyOf: [
        { type: 'null' },
        { type: 'object', additionalProperties: true },
      ],
    },
  },
};

const DEFAULT_ACTOR =
  typeof process.env.AGENT_ACTOR_ID === 'string' && process.env.AGENT_ACTOR_ID.trim().length
    ? process.env.AGENT_ACTOR_ID.trim()
    : 'item-flow-service';

const healthResponseSchema = {
  type: 'object',
  required: ['ok'],
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean', const: true },
  },
};

// Build Fastify with our existing Pino logger instance
// (Fastify lets you pass a custom Pino-compatible logger) :contentReference[oaicite:2]{index=2}
export async function buildServer() {
  const fastify = Fastify({ loggerInstance: appLogger });

  // CORS
  await fastify.register(cors, {
    origin: true, // tighten in production
    methods: ['POST', 'GET', 'OPTIONS'],
  }); // :contentReference[oaicite:3]{index=3}

  fastify.setErrorHandler((err, req, reply) => {
    if (err?.code === 'FST_ERR_VALIDATION' && Array.isArray(err.validation)) {
      const details = {
        fieldErrors: {},
        formErrors: [],
      };

      for (const issue of err.validation) {
        const missingProperty = issue?.params?.missingProperty;
        const instancePath =
          typeof issue?.instancePath === 'string'
            ? issue.instancePath.replace(/^\//, '').replace(/\//g, '.')
            : '';
        const field = missingProperty || instancePath;
        const message = issue?.message ?? 'Invalid value';

        if (field) {
          if (!details.fieldErrors[field]) {
            details.fieldErrors[field] = [];
          }
          details.fieldErrors[field].push(message);
        } else {
          details.formErrors.push(message);
        }
      }

      req.log.warn({ msg: 'request validation failed', details, err });
      return reply.code(400).send({ error: 'INVALID_BODY', details });
    }

    req.log.error({ err, msg: 'unhandled error' });
    return reply.code(err.statusCode ?? 500).send({
      error: err.code ?? 'INTERNAL_ERROR',
      message: err.message ?? 'Unexpected failure',
    });
  });

  try {
    await fastify.register(swagger, {
      openapi: {
        info: {
          title: 'AI Flow Service API',
          version: '0.1.0',
        },
      },
    });

    await fastify.register(swaggerUI, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: false,
      },
      staticCSP: true,
      transformStaticCSP: (header) => header,
    });
    fastify.log.info({ msg: 'Swagger documentation registered', routePrefix: '/docs' });
  } catch (err) {
    fastify.log.error({ err, msg: 'Failed to register Swagger documentation' });
    throw err;
  }

  const RunBody = z
    .object({
      item: z
        .object({
          Artikelbeschreibung: z.string().optional(),
          itemUUid: z.string().optional(),
        })
        .passthrough()
        .optional(),
      Artikelbeschreibung: z.string().optional(),
      itemUUid: z.string().optional(),
    })
    .passthrough();

  const RunCancelBody = z
    .object({
      itemUUid: z.string().trim().min(1),
      actor: z.string().trim().optional(),
    })
    .passthrough();

  // Health
  fastify.get(
    '/health',
    {
      schema: {
        tags: ['system'],
        summary: 'Service health check',
        response: {
          200: healthResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async () => ({ ok: true })
  );

  // Run
  fastify.post('/run', {
      schema: {
        tags: ['flow'],
        summary: 'Run the item enrichment flow',
        body: runRequestBodySchema,
        response: {
          200: { oneOf: [runSuccessResponseSchema, runSkippedResponseSchema] },
          400: { oneOf: [validationErrorResponseSchema, errorResponseSchema] },
          500: errorResponseSchema,
          default: errorResponseSchema,
        },
      },
  }, async (req, reply) => {
    const parsed = RunBody.safeParse(req.body);
    if (!parsed.success) {
      const details = parsed.error.flatten();
      req.log.warn({ msg: 'invalid /run payload', details, body: req.body });
      return reply.code(400).send({ error: 'INVALID_BODY', details });
    }

    const resolvedItem = {
      ...(parsed.data.item ?? {}),
    };

    req.log.info({ msg: 'run requested', item: resolvedItem, source: req.ip });

    if (typeof parsed.data.Artikelbeschreibung === 'string' && !('Artikelbeschreibung' in resolvedItem)) {
      resolvedItem.Artikelbeschreibung = parsed.data.Artikelbeschreibung;
    }
    if (typeof parsed.data.itemUUid === 'string' && !('itemUUid' in resolvedItem)) {
      resolvedItem.itemUUid = parsed.data.itemUUid;
    }

    const artikelbeschreibung =
      typeof resolvedItem.Artikelbeschreibung === 'string'
        ? resolvedItem.Artikelbeschreibung.trim()
        : '';
    const itemId =
      typeof resolvedItem.itemUUid === 'string' ? resolvedItem.itemUUid.trim() : '';

    const triggerFailureFn =
      typeof globalThis.__TRIGGER_FAILURE_OVERRIDE__ === 'function'
        ? globalThis.__TRIGGER_FAILURE_OVERRIDE__
        : triggerAgenticFailure;

    const notifyTriggerFailure = async ({ labels = [], statusCode, responseBody, errorMessage }) => {
      if (!itemId) {
        return null;
      }

      const normalizedLabels = Array.from(
        new Set(
          labels
            .filter((label) => typeof label === 'string' && label.trim().length)
            .map((label) => label.trim()),
        ),
      );

      try {
        const snapshot = await triggerFailureFn({
          itemId,
          actor: DEFAULT_ACTOR,
          labels: normalizedLabels,
          searchTerm: artikelbeschreibung,
          statusCode,
          responseBody,
          errorMessage,
        });

        if (snapshot) {
          req.log.info({
            msg: 'trigger failure notification dispatched',
            itemId,
            artikelbeschreibung,
            labels: normalizedLabels,
          });
        }

        return snapshot ?? null;
      } catch (failureErr) {
        req.log.error({
          err: failureErr,
          itemId,
          artikelbeschreibung,
          msg: 'trigger failure helper failed',
        });
        return null;
      }
    };

    const cloneResponseBodyForHelper = (input) => {
      if (!input || typeof input !== 'object') {
        return input ?? null;
      }

      if (typeof structuredClone === 'function') {
        try {
          return structuredClone(input);
        } catch (cloneErr) {
          req.log.debug({ err: cloneErr, msg: 'structuredClone failed for trigger failure payload' });
        }
      }

      try {
        return JSON.parse(JSON.stringify(input));
      } catch (cloneErr) {
        req.log.debug({ err: cloneErr, msg: 'JSON clone failed for trigger failure payload' });
        return input;
      }
    };

    const sendSkip = async (reason, details = {}, extraLabels = []) => {
      const payload = {
        status: 'SKIPPED',
        reason,
        ...(details && Object.keys(details).length ? { details } : {}),
      };

      const logContext = { msg: 'run skipped', reason };
      if (itemId) {
        logContext.itemId = itemId;
      }
      if (artikelbeschreibung) {
        logContext.artikelbeschreibung = artikelbeschreibung;
      }
      if (payload.details) {
        logContext.details = payload.details;
      }

      req.log.warn(logContext);
      if (!itemId) {
        return reply.code(200).send(payload);
      }

      const detailLabels = [];
      if (Array.isArray(details?.missingFields)) {
        detailLabels.push(
          ...details.missingFields
            .filter((field) => typeof field === 'string' && field.trim().length)
            .map((field) => `missing:${field.trim()}`),
        );
      }
      if (Array.isArray(details?.issues)) {
        detailLabels.push(
          ...details.issues
            .filter((issue) => typeof issue === 'string' && issue.trim().length)
            .map((issue) => `issue:${issue.trim()}`),
        );
      }

      const responseBodyForHelper = cloneResponseBodyForHelper(payload);
      const snapshot = await notifyTriggerFailure({
        labels: ['preflight_skipped', ...extraLabels, ...detailLabels],
        statusCode: 400,
        responseBody: responseBodyForHelper,
        errorMessage: reason,
      });

      if (snapshot) {
        const detailsPayload =
          payload.details && typeof payload.details === 'object' ? payload.details : {};
        payload.details = {
          ...detailsPayload,
          refreshedSnapshot: snapshot,
        };
      }

      return reply.code(200).send(payload);
    };

    const missingFields = [];
    if (!itemId) {
      missingFields.push('itemUUid');
    }
    if (!artikelbeschreibung) {
      missingFields.push('Artikelbeschreibung');
    }

    if (missingFields.length) {
      const reason =
        missingFields.length === 1
          ? `Missing required field: ${missingFields[0]}`
          : `Missing required fields: ${missingFields.join(', ')}`;
      return sendSkip(reason, { missingFields });
    }

    const modelIssues = resolveModelConfigurationIssues();
    if (modelIssues) {
      return sendSkip(modelIssues.reason, { issues: modelIssues.issues }, ['configuration_missing']);
    }

    const normalizedItem = {
      ...resolvedItem,
      itemUUid: itemId,
      Artikelbeschreibung: artikelbeschreibung,
    };

    const runItemFlowFn =
      typeof globalThis.__RUN_ITEM_FLOW_OVERRIDE__ === 'function'
        ? globalThis.__RUN_ITEM_FLOW_OVERRIDE__
        : runItemFlow;

    let runRegistration = null;
    try {
      runRegistration = beginRun(itemId, {
        actor: DEFAULT_ACTOR,
        artikelbeschreibung,
      });
    } catch (registrationErr) {
      req.log.error({ err: registrationErr, itemId, artikelbeschreibung, msg: 'failed to register run for cancellation' });
    }

    await logRequestStart(itemId, artikelbeschreibung);
    try {
      const runOptions = { search: artikelbeschreibung };
      if (runRegistration?.signal) {
        runOptions.cancellationSignal = runRegistration.signal;
      }

      const result = await runItemFlowFn(normalizedItem, itemId, runOptions);
      if (runRegistration) {
        runRegistration.complete({ status: 'SUCCESS' });
      }
      await logRequestEnd(itemId, 'SUCCESS');
      req.log.info({ msg: 'run end', itemId, artikelbeschreibung, status: 'SUCCESS' });
      return result;
    } catch (err) {
      if (err instanceof FlowError && err.code === 'RUN_CANCELLED') {
        if (runRegistration) {
          runRegistration.cancel({ reason: err.message });
        }
        await logRequestEnd(itemId, 'CANCELLED', err.message);
        req.log.info({ msg: 'run cancelled', itemId, artikelbeschreibung });
        const fallbackBody = { error: err.code, message: err.message };
        return reply.code(err.statusCode).send(fallbackBody);
      }

      if (runRegistration) {
        runRegistration.fail({
          code: err instanceof FlowError ? err.code : 'INTERNAL_ERROR',
          message: err?.message ?? 'Unexpected failure',
        });
      }

      await logRequestEnd(itemId, 'FAILED', err.message);
      if (err instanceof FlowError) {
        req.log.warn({ err, itemId, artikelbeschreibung, msg: 'run failed with flow error' });
        const fallbackBody = { error: err.code, message: err.message };
        const responseBodyForHelper = cloneResponseBodyForHelper(fallbackBody);
        const snapshot = await notifyTriggerFailure({
          labels: ['run_failed', `flow_error:${err.code}`],
          statusCode: err.statusCode,
          responseBody: responseBodyForHelper,
          errorMessage: err.message,
        });
        if (snapshot) {
          fallbackBody.refreshedSnapshot = snapshot;
        }
        return reply.code(err.statusCode).send(fallbackBody);
      }
      req.log.error({ err, itemId, artikelbeschreibung, msg: 'run failed' });
      const fallbackBody = { error: 'INTERNAL_ERROR', message: 'Unexpected failure' };
      const responseBodyForHelper = cloneResponseBodyForHelper(fallbackBody);
      const snapshot = await notifyTriggerFailure({
        labels: ['run_failed', 'unexpected_error'],
        statusCode: 500,
        responseBody: responseBodyForHelper,
        errorMessage: err?.message ?? 'Unexpected failure',
      });
      if (snapshot) {
        fallbackBody.refreshedSnapshot = snapshot;
      }
      return reply.code(500).send(fallbackBody);
    }
  });

  fastify.post(
    '/run/cancel',
    {
      schema: {
        tags: ['flow'],
        summary: 'Request cancellation for an in-flight run',
        body: runCancelRequestBodySchema,
        response: {
          200: runCancelSuccessResponseSchema,
          400: { oneOf: [validationErrorResponseSchema, runCancelErrorResponseSchema] },
          404: runCancelErrorResponseSchema,
          409: runCancelErrorResponseSchema,
          500: runCancelErrorResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const parsed = RunCancelBody.safeParse(req.body);
      if (!parsed.success) {
        const details = parsed.error.flatten();
        req.log.warn({ msg: 'invalid /run/cancel payload', details, body: req.body });
        return reply.code(400).send({ error: 'INVALID_BODY', details });
      }

      const itemId = parsed.data.itemUUid;
      const actor = parsed.data.actor || DEFAULT_ACTOR;

      req.log.info({ msg: 'cancellation requested', itemId, actor });

      const triggerFailureFn =
        typeof globalThis.__TRIGGER_FAILURE_OVERRIDE__ === 'function'
          ? globalThis.__TRIGGER_FAILURE_OVERRIDE__
          : triggerAgenticFailure;

      const cloneForHelper = (input) => {
        if (!input || typeof input !== 'object') {
          return input ?? null;
        }

        if (typeof structuredClone === 'function') {
          try {
            return structuredClone(input);
          } catch (cloneErr) {
            req.log.debug({ err: cloneErr, msg: 'structuredClone failed for cancellation payload' });
          }
        }

        try {
          return JSON.parse(JSON.stringify(input));
        } catch (cloneErr) {
          req.log.debug({ err: cloneErr, msg: 'JSON clone failed for cancellation payload' });
          return input;
        }
      };

      const notifyCancellationFailure = async ({ labels = [], statusCode, responseBody, errorMessage }) => {
        const normalizedLabels = Array.from(
          new Set(
            labels
              .filter((label) => typeof label === 'string' && label.trim().length)
              .map((label) => label.trim()),
          ),
        );

        try {
          await triggerFailureFn({
            itemId,
            actor,
            labels: ['cancellation_failed', ...normalizedLabels],
            searchTerm: null,
            statusCode,
            responseBody,
            errorMessage,
          });
        } catch (helperErr) {
          req.log.error({ err: helperErr, itemId, actor, msg: 'cancellation trigger failure helper failed' });
        }
      };

      let cancellationResult;
      try {
        cancellationResult = requestCancellation(itemId, { actor });
      } catch (err) {
        req.log.error({ err, itemId, actor, msg: 'cancellation coordinator threw error' });
        const responseBody = { error: 'CANCELLATION_FAILED', message: 'Unable to request cancellation', status: 'ERROR' };
        const helperPayload = cloneForHelper(responseBody);
        await notifyCancellationFailure({
          labels: ['cancellation_error'],
          statusCode: 500,
          responseBody: helperPayload,
          errorMessage: err?.message ?? 'Unable to request cancellation',
        });
        return reply.code(500).send(responseBody);
      }

      if (cancellationResult.ok) {
        const payload = {
          status: cancellationResult.status,
          itemId,
          actor,
          message: cancellationResult.message,
          requestedBy: cancellationResult.requestedBy ?? actor,
          previousOutcome: cancellationResult.outcome ?? null,
        };
        req.log.info({ msg: 'cancellation dispatched', itemId, actor, status: cancellationResult.status });
        return reply.code(200).send(payload);
      }

      const failureStatusCode =
        cancellationResult.status === 'NOT_FOUND'
          ? 404
          : cancellationResult.status === 'INVALID_ID'
            ? 400
            : 409;

      const responseBody = {
        error: 'CANCELLATION_FAILED',
        message: cancellationResult.message,
        status: cancellationResult.status,
      };

      const helperPayload = cloneForHelper(responseBody);
      const labelStatus = typeof cancellationResult.status === 'string'
        ? `cancellation_status:${cancellationResult.status.toLowerCase()}`
        : 'cancellation_status:unknown';
      await notifyCancellationFailure({
        labels: [labelStatus],
        statusCode: failureStatusCode,
        responseBody: helperPayload,
        errorMessage: cancellationResult.message,
      });

      req.log.warn({
        msg: 'cancellation could not be honored',
        itemId,
        actor,
        status: cancellationResult.status,
        reason: cancellationResult.message,
      });

      return reply.code(failureStatusCode).send(responseBody);
    }
  );

  return fastify;
}

// Allow starting directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 3000);
  const host = '0.0.0.0';
  const server = await buildServer();
  await server.listen({ port, host });
  server.log.info({ msg: `API listening on ${host}:${port}` });
}
