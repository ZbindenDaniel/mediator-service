const envDefaults = {
  OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
  OLLAMA_MODEL: 'dummy-model',
  SEARCH_BASE_URL: 'http://127.0.0.1',
  SEARCH_PORT: '3000',
  SEARCH_PATH: '/search',
  AGENT_API_BASE_URL: 'http://127.0.0.1:9999',
  AGENT_SHARED_SECRET: 'test-secret',
};

for (const [key, value] of Object.entries(envDefaults)) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}

async function main() {
  const tests = [
    {
      name: 'db request log upsert behaviour',
      loader: () => import('./db.upsert.test.js'),
      exportName: 'runDbUpsertTests',
    },
    {
      name: 'json sanitizer scenarios',
      loader: () => import('./jsonSanitizer.test.js'),
      exportName: 'runJsonSanitizerTests',
    },
    {
      name: 'searchShopware scenarios',
      loader: () => import('./searchShopware.test.js'),
      exportName: 'runSearchShopwareTests',
    },
    {
      name: 'searchWeb parser scenarios',
      loader: () => import('./searchWeb.test.js'),
      exportName: 'runSearchWebTests',
    },
    {
      name: 'web search HTML parsing strategies',
      loader: () => import('./webSearchParsing.test.js'),
      exportName: 'runWebSearchParsingTests',
    },
    {
      name: 'web search MCP error handling',
      loader: () => import('./webSearchServer.test.js'),
      exportName: 'runWebSearchServerTests',
    },
    {
      name: 'search limiter queue behaviour',
      loader: () => import('./rateLimiter.test.js'),
      exportName: 'runRateLimiterTests',
    },
    {
      name: 'external callback request formatting',
      loader: () => import('./externalApi.test.js'),
      exportName: 'runExternalApiTests',
    },
    {
      name: 'item flow helper scenarios',
      loader: () => import('./itemFlow.helpers.test.js'),
      exportName: 'runItemFlowHelperTests',
    },
    {
      name: 'api /run handler scenarios',
      loader: () => import('./api.run.test.js'),
      exportName: 'runApiRunTests',
    },
    {
      name: 'api /run/cancel handler scenarios',
      loader: () => import('./api.cancel.test.js'),
      exportName: 'runApiCancelTests',
    },
  ];

  const results = [];
  for (const test of tests) {
    try {
      if (typeof test.loader === 'function') {
        const module = await test.loader();
        const testFn = module[test.exportName];
        if (typeof testFn !== 'function') {
          throw new Error(`No runnable export found for ${test.name}`);
        }
        await testFn();
      } else if (typeof test.fn === 'function') {
        await test.fn();
      } else {
        throw new Error(`No loader or fn specified for ${test.name}`);
      }
      console.log(`✅ ${test.name}`);
      results.push({ name: test.name, status: 'passed' });
    } catch (err) {
      console.error(`❌ ${test.name}`);
      console.error(err);
      results.push({ name: test.name, status: 'failed', err });
    }
  }

  const failed = results.filter((r) => r.status === 'failed');
  if (failed.length) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Unexpected test runner failure', err);
  process.exit(1);
});
