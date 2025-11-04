import assert from 'node:assert/strict';
import { resolveShopwareMatch } from '../flow/itemFlowShopware.js';
import { collectSearchContexts } from '../flow/itemFlowSearch.js';
import { runExtractionAttempts } from '../flow/itemFlowExtraction.js';
import { FlowError } from '../flow/errors.js';
import { AgentOutputSchema } from '../flow/itemFlowSchemas.js';
import { RateLimitError } from '../tools/searchWeb.js';

const noopLogger = {
  info() {},
  warn() {},
  error() {},
  debug() {},
};

const baseAgentPayload = {
  Artikelbeschreibung: 'Desc',
  Marktpreis: null,
  Kurzbeschreibung: 'Short',
  Langtext: 'Long',
  Hersteller: 'Maker',
  Länge_mm: null,
  Breite_mm: null,
  Höhe_mm: null,
  Gewicht_kg: null,
};

async function testAgentOutputSchemaOptionalItemUuid() {
  const { success, data } = AgentOutputSchema.safeParse({ ...baseAgentPayload });
  assert.equal(success, true, 'agent output schema should accept payload without itemUUid');
  assert.equal(data.itemUUid, undefined, 'itemUUid should remain undefined when omitted');

  const invalid = AgentOutputSchema.safeParse({
    ...baseAgentPayload,
    __searchQueries: [''],
  });
  assert.equal(invalid.success, false, 'agent output schema should reject invalid search queries');

  const localizedNumbers = AgentOutputSchema.safeParse({
    ...baseAgentPayload,
    Marktpreis: '249,99 €',
    Länge_mm: '1.234,56',
    Breite_mm: '12,5',
    Höhe_mm: '-0,75',
    Gewicht_kg: '0.5 kg',
    sources: [
      { title: 'Primary Source', url: 'https://example.com/source', snippet: 'Useful details' },
    ],
    confidence: 0.8,
    confidenceNote: 'High confidence in extracted values',
    auxiliaryHint: 'extra metadata',
  });

  assert.equal(localizedNumbers.success, true, 'agent output schema should coerce localized numeric strings');
  assert.equal(localizedNumbers.data.Marktpreis, 249.99, 'localized currency should convert to number');
  assert.equal(localizedNumbers.data.Länge_mm, 1234.56, 'thousand separators and decimals should normalize');
  assert.equal(localizedNumbers.data.Breite_mm, 12.5, 'comma decimals should convert to dot decimals');
  assert.equal(localizedNumbers.data.Höhe_mm, -0.75, 'negative comma decimals should convert to negative numbers');
  assert.equal(localizedNumbers.data.Gewicht_kg, 0.5, 'numeric strings with units should coerce to numbers');
  assert(Array.isArray(localizedNumbers.data.sources), 'agent sources should be preserved when provided');
  assert.equal(localizedNumbers.data.sources.length, 1, 'agent sources should include entries');
  assert.equal(localizedNumbers.data.confidence, 0.8, 'confidence hints should be accepted');
  assert.equal(localizedNumbers.data.confidenceNote, 'High confidence in extracted values', 'confidence notes should be preserved');
  assert.equal(localizedNumbers.data.auxiliaryHint, 'extra metadata', 'unknown auxiliary fields should pass through');
}

async function testResolveShopwareMatchShortcut() {
  const llmResponses = [
    {
      content: '<think>reasoning</think>{"isMatch":true,"confidence":0.92,"matchedProductId":"abc","target":{"Kurzbeschreibung":"Kurz","Langtext":"Lang","Hersteller":"Her","Marktpreis":null,"Länge_mm":null,"Breite_mm":null,"Höhe_mm":null,"Gewicht_kg":null,"Artikelbeschreibung":"Desc"}}',
    },
  ];
  const llm = { async invoke() { return llmResponses.shift(); } };

  const normalizedTarget = { itemUUid: 'abc', Artikelbeschreibung: 'Desc' };
  const shopwareResult = {
    products: [
      { id: 'abc', url: 'https://shopware.example/item', name: 'Matched product' },
      { id: 'fallback', url: 'https://shopware.example/fallback', name: 'Fallback product' },
    ],
  };

  const shortcut = await resolveShopwareMatch({
    llm,
    logger: noopLogger,
    searchTerm: 'search term',
    targetFormat: '{}',
    shopwarePrompt: 'prompt',
    shopwareResult,
    normalizedTarget,
    itemId: 'abc',
  });

  assert(shortcut, 'expected helper to return shortcut information');
  assert(shortcut.finalData, 'expected shortcut to include final data');
  assert.equal(shortcut.sources.length, 1, 'shopware shortcut should include matched source');
  assert(shortcut.summary.includes('Shopware match'), 'shopware summary should mention match');
  assert(shortcut.reviewNotes.includes('Shopware match'), 'shopware review notes should mention match');
  assert.equal(shortcut.reviewedBy, 'shopware-shortcut', 'shopware shortcut should mark reviewer');
}

async function testCollectSearchContextsRateLimit() {
  const searchInvoker = async () => { throw new RateLimitError('rate limited', { statusCode: 429 }); };

  await assert.rejects(
    () => collectSearchContexts({
      searchTerm: 'term',
      searchInvoker,
      logger: noopLogger,
      itemId: 'item',
      FlowError,
    }),
    (err) => err instanceof FlowError && err.code === 'RATE_LIMITED',
    'collectSearchContexts should wrap rate limit errors'
  );
}

async function testRunExtractionAttemptsRetryFlow() {
  const llmResponses = [
    {
      content: '<think>first</think>{"__searchQueries":["extra"],"Artikelbeschreibung":"Desc","Marktpreis":null,"Kurzbeschreibung":"Short","Langtext":"Long","Hersteller":"Maker","Länge_mm":null,"Breite_mm":null,"Höhe_mm":null,"Gewicht_kg":null}'
    },
    {
      content: JSON.stringify({
        Artikelbeschreibung: 'Desc',
        Marktpreis: null,
        Kurzbeschreibung: 'Short',
        Langtext: 'Long',
        Hersteller: 'Maker',
        Länge_mm: null,
        Breite_mm: null,
        Höhe_mm: null,
        Gewicht_kg: null,
      }),
    },
    { content: 'FAIL: missing details' },
    {
      content: JSON.stringify({
        Artikelbeschreibung: 'Desc',
        Marktpreis: null,
        Kurzbeschreibung: 'Short',
        Langtext: 'Longer',
        Hersteller: 'Maker',
        Länge_mm: 1,
        Breite_mm: 2,
        Höhe_mm: 3,
        Gewicht_kg: 4,
      }),
    },
    { content: 'PASS: all good' },
  ];

  const llm = {
    async invoke() {
      const next = llmResponses.shift();
      if (!next) {
        throw new Error('Unexpected LLM invocation');
      }
      return next;
    },
  };

  const primarySources = [{ title: 'Primary', url: 'https://example.com/primary' }];
  const searchInvoker = async (query, _maxResults, metadata) => {
    if (metadata?.context === 'primary') {
      return { text: 'primary text', sources: primarySources };
    }
    return { text: `extra for ${query}`, sources: [{ title: `extra ${query}`, url: `https://example.com/${metadata.requestIndex}` }] };
  };

  const { searchContexts, aggregatedSources, recordSources, buildAggregatedSearchText } = await collectSearchContexts({
    searchTerm: 'term',
    searchInvoker,
    logger: noopLogger,
    itemId: 'item',
    FlowError,
  });

  const result = await runExtractionAttempts({
    llm,
    logger: noopLogger,
    itemId: 'item',
    maxAttempts: 3,
    searchContexts,
    aggregatedSources,
    recordSources,
    buildAggregatedSearchText,
    extractPrompt: 'extract prompt',
    targetFormat: '{}',
    supervisorPrompt: 'supervisor prompt',
    AgentOutputSchema,
    searchInvoker,
    FlowError,
  });

  assert.equal(result.success, true, 'extraction should succeed after retries');
  assert.equal(result.data.Kurzbeschreibung, 'Short', 'data should include extracted fields');
  assert(result.sources.length >= 2, 'sources should include extra search results');
  assert(result.supervisor.startsWith('PASS'), 'final supervisor should pass');
  assert.equal(searchContexts.length, 2, 'additional search context should be recorded');
}

async function testRunExtractionAttemptsSchemaFailure() {
  const llmResponses = [
    { content: JSON.stringify({ unexpected: 'payload' }) },
  ];

  const llm = {
    async invoke() {
      const next = llmResponses.shift();
      if (!next) {
        throw new Error('Unexpected LLM invocation');
      }
      return next;
    },
  };

  const primarySources = [{ title: 'Primary', url: 'https://example.com/primary' }];
  const searchInvoker = async (_query, _maxResults, metadata) => {
    if (metadata?.context === 'primary') {
      return { text: 'primary text', sources: primarySources };
    }
    return { text: 'no extra', sources: [] };
  };

  const { searchContexts, aggregatedSources, recordSources, buildAggregatedSearchText } = await collectSearchContexts({
    searchTerm: 'term',
    searchInvoker,
    logger: noopLogger,
    itemId: 'item',
    FlowError,
  });

  await assert.rejects(
    () => runExtractionAttempts({
      llm,
      logger: noopLogger,
      itemId: 'item',
      maxAttempts: 1,
      searchContexts,
      aggregatedSources,
      recordSources,
      buildAggregatedSearchText,
      extractPrompt: 'extract prompt',
      targetFormat: '{}',
      supervisorPrompt: 'supervisor prompt',
      AgentOutputSchema,
      searchInvoker,
      FlowError,
    }),
    (err) => err instanceof FlowError && err.code === 'SCHEMA_VALIDATION_FAILED',
    'schema validation failures should surface with dedicated flow error'
  );
}

async function testRunExtractionAttemptsSearchRequestsDoNotConsumeAttempts() {
  const llmResponses = [
    {
      content: JSON.stringify({
        __searchQueries: ['follow up details'],
        ...baseAgentPayload,
      }),
    },
    {
      content: JSON.stringify({
        ...baseAgentPayload,
        Langtext: 'Long with search data',
      }),
    },
    { content: 'PASS: looks good' },
  ];

  const llm = {
    async invoke() {
      const next = llmResponses.shift();
      if (!next) {
        throw new Error('Unexpected LLM invocation');
      }
      return next;
    },
  };

  const primarySources = [{ title: 'Primary', url: 'https://example.com/primary' }];
  const searchInvoker = async (query, _maxResults, metadata) => {
    if (metadata?.context === 'primary') {
      return { text: 'primary context', sources: primarySources };
    }
    return {
      text: `follow up for ${query}`,
      sources: [{ title: `extra ${query}`, url: `https://example.com/${query}` }],
    };
  };

  const { searchContexts, aggregatedSources, recordSources, buildAggregatedSearchText } = await collectSearchContexts({
    searchTerm: 'term',
    searchInvoker,
    logger: noopLogger,
    itemId: 'item',
    FlowError,
  });

  const result = await runExtractionAttempts({
    llm,
    logger: noopLogger,
    itemId: 'item',
    maxAttempts: 1,
    searchContexts,
    aggregatedSources,
    recordSources,
    buildAggregatedSearchText,
    extractPrompt: 'extract prompt',
    targetFormat: '{}',
    supervisorPrompt: 'supervisor prompt',
    AgentOutputSchema,
    searchInvoker,
    FlowError,
  });

  assert.equal(result.success, true, 'extraction should succeed with search-assisted retry on same attempt');
  assert.equal(result.data.Langtext, 'Long with search data', 'validated payload should reflect final extraction');
  assert.equal(searchContexts.length, 2, 'search contexts should include the additional agent-requested search');
}

async function testRunExtractionAttemptsRateLimitPropagation() {
  const llmResponses = [
    { content: '<think>request</think>{"__searchQueries":["limit"],"Artikelbeschreibung":"Desc","Marktpreis":null,"Kurzbeschreibung":"Short","Langtext":"Long","Hersteller":"Maker","Länge_mm":null,"Breite_mm":null,"Höhe_mm":null,"Gewicht_kg":null}' },
    { content: JSON.stringify({
      Artikelbeschreibung: 'Desc',
      Marktpreis: null,
      Kurzbeschreibung: 'Short',
      Langtext: 'Long',
      Hersteller: 'Maker',
      Länge_mm: null,
      Breite_mm: null,
      Höhe_mm: null,
      Gewicht_kg: null,
    }) },
    { content: 'PASS: fine' },
  ];

  const llm = {
    async invoke() {
      const next = llmResponses.shift();
      if (!next) {
        throw new Error('Unexpected LLM invocation');
      }
      return next;
    },
  };

  const searchInvoker = async (query, _maxResults, metadata) => {
    if (metadata?.context === 'primary') {
      return { text: 'primary text', sources: [] };
    }
    throw new RateLimitError('limited', { statusCode: 429 });
  };

  const { searchContexts, aggregatedSources, recordSources, buildAggregatedSearchText } = await collectSearchContexts({
    searchTerm: 'term',
    searchInvoker,
    logger: noopLogger,
    itemId: 'item',
    FlowError,
  });

  await assert.rejects(
    () => runExtractionAttempts({
      llm,
      logger: noopLogger,
      itemId: 'item',
      maxAttempts: 2,
      maxAgentSearchesPerRequest: 1,
      searchContexts,
      aggregatedSources,
      recordSources,
      buildAggregatedSearchText,
      extractPrompt: 'extract prompt',
      targetFormat: '{}',
      supervisorPrompt: 'supervisor prompt',
      AgentOutputSchema,
      searchInvoker,
      FlowError,
    }),
    (err) => err instanceof FlowError && err.code === 'RATE_LIMITED',
    'rate limit errors during additional searches should propagate'
  );
}

async function testRunExtractionAttemptsTruncatesSearchRequests() {
  const llmResponses = [
    {
      content: JSON.stringify({
        __searchQueries: ['allowed', 'ignored'],
        ...baseAgentPayload,
      }),
    },
    { content: JSON.stringify(baseAgentPayload) },
    { content: 'PASS: ok' },
  ];

  const llm = {
    async invoke() {
      const next = llmResponses.shift();
      if (!next) {
        throw new Error('Unexpected LLM invocation');
      }
      return next;
    },
  };

  const searchCalls = [];
  const primarySources = [{ title: 'Primary', url: 'https://example.com/primary' }];
  const searchInvoker = async (query, _maxResults, metadata) => {
    if (metadata?.context === 'primary') {
      return { text: 'primary text', sources: primarySources };
    }
    searchCalls.push({ query, metadata });
    return { text: `result for ${query}`, sources: [{ title: query, url: 'https://example.com/search' }] };
  };

  const { searchContexts, aggregatedSources, recordSources, buildAggregatedSearchText } = await collectSearchContexts({
    searchTerm: 'term',
    searchInvoker,
    logger: noopLogger,
    itemId: 'item',
    FlowError,
  });

  const result = await runExtractionAttempts({
    llm,
    logger: noopLogger,
    itemId: 'item',
    maxAttempts: 1,
    maxAgentSearchesPerRequest: 1,
    searchContexts,
    aggregatedSources,
    recordSources,
    buildAggregatedSearchText,
    extractPrompt: 'extract prompt',
    targetFormat: '{}',
    supervisorPrompt: 'supervisor prompt',
    AgentOutputSchema,
    searchInvoker,
    FlowError,
  });

  assert.equal(result.success, true, 'extraction should succeed after truncating extra search requests');
  assert.equal(searchCalls.length, 1, 'only one agent-driven search should execute');
  assert.equal(searchCalls[0].query, 'allowed', 'first search query should be used');
  assert.equal(searchCalls[0].metadata.requestIndex, 1, 'request index should start at 1');
}

async function testRunExtractionAttemptsTooManySearchRequestsReturnsBestEffort() {
  const llmResponses = [
    {
      content: JSON.stringify({
        __searchQueries: ['first extra'],
        ...baseAgentPayload,
      }),
    },
    {
      content: JSON.stringify({
        __searchQueries: ['second extra'],
        ...baseAgentPayload,
        Langtext: 'Long with second extra context',
      }),
    },
    {
      content: JSON.stringify({
        __searchQueries: ['third extra'],
        ...baseAgentPayload,
        Langtext: 'Long with third extra context',
      }),
    },
    {
      content: JSON.stringify({
        __searchQueries: ['fourth extra'],
        ...baseAgentPayload,
        Langtext: 'Best effort after search limit',
      }),
    },
  ];

  const llm = {
    async invoke() {
      const next = llmResponses.shift();
      if (!next) {
        throw new Error('Unexpected LLM invocation');
      }
      return next;
    },
  };

  const searchCalls = [];
  const primarySources = [{ title: 'Primary', url: 'https://example.com/primary' }];
  const searchInvoker = async (query, _maxResults, metadata) => {
    if (metadata?.context === 'primary') {
      return { text: 'primary text', sources: primarySources };
    }
    searchCalls.push({ query, metadata });
    return {
      text: `context for ${query}`,
      sources: [{ title: query, url: `https://example.com/${query}` }],
    };
  };

  const { searchContexts, aggregatedSources, recordSources, buildAggregatedSearchText } = await collectSearchContexts({
    searchTerm: 'term',
    searchInvoker,
    logger: noopLogger,
    itemId: 'item',
    FlowError,
  });

  const result = await runExtractionAttempts({
    llm,
    logger: noopLogger,
    itemId: 'item',
    maxAttempts: 2,
    maxAgentSearchesPerRequest: 1,
    searchContexts,
    aggregatedSources,
    recordSources,
    buildAggregatedSearchText,
    extractPrompt: 'extract prompt',
    targetFormat: '{}',
    supervisorPrompt: 'supervisor prompt',
    AgentOutputSchema,
    searchInvoker,
    FlowError,
  });

  assert.equal(result.success, false, 'extraction should request manual review after exceeding search limit');
  assert.equal(result.supervisor, 'TOO_MANY_SEARCH_REQUESTS', 'supervisor notes should reflect search limit');
  assert.equal(result.data.Langtext, 'Best effort after search limit', 'best-effort payload should be returned');
  assert.equal(searchCalls.length, 3, 'should execute searches until limit is exceeded');
  assert.equal(searchContexts.length, 4, 'search contexts should include primary plus completed extra searches');
  assert(aggregatedSources.length >= 4, 'aggregated sources should include data from completed searches');
}

export async function runItemFlowHelperTests() {
  await testAgentOutputSchemaOptionalItemUuid();
  await testResolveShopwareMatchShortcut();
  await testCollectSearchContextsRateLimit();
  await testRunExtractionAttemptsRetryFlow();
  await testRunExtractionAttemptsSchemaFailure();
  await testRunExtractionAttemptsSearchRequestsDoNotConsumeAttempts();
  await testRunExtractionAttemptsRateLimitPropagation();
  await testRunExtractionAttemptsTruncatesSearchRequests();
  await testRunExtractionAttemptsTooManySearchRequestsReturnsBestEffort();
  console.log('All itemFlow helper tests passed.');
}
