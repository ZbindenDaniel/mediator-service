/**
 * Manual harness for the agentic "wording" stage.
 *
 * Runs the REAL wording stage against your Ollama and prints the rewrite
 * (Artikelbeschreibung / Kurzbeschreibung / tidied Langtext) plus timing — so you can iterate on
 * `prompts/wording.md` and `contracts/standards.json` in seconds, without restarting full agentic runs.
 *
 * Run it in an environment whose MODEL_* env points at your Ollama (e.g. inside the app container):
 *   npm run try:wording                          # built-in messy fixture
 *   npm run try:wording -- path/to/item.json     # your own item
 *   ts-node --transpile-only scripts/try-wording.ts path/to/item.json
 *
 * item.json shape (all optional): { "Hersteller", "Artikelbeschreibung", "Kurzbeschreibung", "Langtext": {…} }
 */
import fs from 'fs';
import { modelConfig } from '../backend/agentic/config';
import { ensureModelHttpTimeouts } from '../backend/agentic/utils/http-dispatcher';
import { loadPrompts } from '../backend/agentic/flow/prompts';
import { getStandardsContract } from '../backend/contracts/registry';
import { runWordingStage } from '../backend/agentic/flow/item-flow-wording';
import type { ChatModel } from '../backend/agentic/flow/item-flow-extraction';

// A deliberately messy item: banned phrases (Garantie/Lieferumfang/fabrikneu/jetzt kaufen), marketing
// fluff, and English / odd spec key names — exercises both the prose rewrite and the Langtext tidy.
const FIXTURE = {
  Hersteller: 'Lenovo',
  Artikelbeschreibung: 'Lenovo ThinkPad X1 Carbon Gen 9 Notebook mit einer Garantie von 24 Monaten – jetzt kaufen!',
  Kurzbeschreibung:
    'Das ideale Business-Notebook für höchste Ansprüche! Fabrikneu. Im Lieferumfang enthalten: Netzteil und Handbuch.',
  Langtext: {
    Processor: 'Intel Core i7-1165G7',
    'Storage Type': 'SSD',
    'RAM Size': '16 GB',
    Display: '14 inch FHD'
  }
};

// Mirrors AgenticInvoker.loadModel (backend/agentic/invoker.ts) for the ollama provider — kept in sync
// by hand; this is a dev harness, not production.
async function buildOllama(): Promise<ChatModel> {
  await ensureModelHttpTimeouts(console as unknown as Parameters<typeof ensureModelHttpTimeouts>[0]);
  const { ChatOllama } = await import('@langchain/ollama');
  const client = new ChatOllama({
    baseUrl: modelConfig.baseUrl,
    model: modelConfig.textModel,
    keepAlive: '10m',
    ...(typeof modelConfig.numCtx === 'number' ? { numCtx: modelConfig.numCtx } : {}),
    ...(modelConfig.formatJson ? { format: 'json' } : {})
  } as ConstructorParameters<typeof ChatOllama>[0]);
  return client as unknown as ChatModel;
}

async function main(): Promise<void> {
  if (modelConfig.provider !== 'ollama') {
    console.error(
      `try-wording builds an Ollama client, but MODEL_PROVIDER=${modelConfig.provider}. ` +
        'Set it to ollama (or extend this harness) before running.'
    );
    process.exit(1);
  }

  const filePath = process.argv[2];
  const candidate = filePath ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : FIXTURE;

  console.log(`\n=== INPUT ${filePath ? `(${filePath})` : '(built-in fixture)'} ===`);
  console.log(JSON.stringify(candidate, null, 2));

  const llm = await buildOllama();
  const { wording } = await loadPrompts({ itemId: 'try-wording' });
  const standards = getStandardsContract();
  console.log(`\nmodel=${modelConfig.textModel} · standards rules=${standards?.bannedPhrases?.length ?? 0}`);

  const started = Date.now();
  const result = await runWordingStage({
    llm,
    logger: console as unknown as Parameters<typeof runWordingStage>[0]['logger'],
    itemId: 'try-wording',
    wordingPrompt: wording,
    candidate: candidate as Parameters<typeof runWordingStage>[0]['candidate'],
    standards
  });
  const ms = Date.now() - started;

  console.log(`\n=== OUTPUT (${ms} ms) ===`);
  if (!result) {
    console.log('(null — no usable rewrite; the pipeline would keep extraction wording)');
    return;
  }
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
