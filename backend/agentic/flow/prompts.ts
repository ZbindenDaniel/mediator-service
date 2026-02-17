import fs from 'fs/promises';
import path from 'path';
import { FlowError } from './errors';
import type { ItemFlowLogger } from './item-flow';

// TODO(agent): Revisit prompt loading cache strategy once planner usage stabilizes.
// TODO(agent): Validate pricing rule prompt composition once pricing telemetry is available.
const PROMPTS_DIR = path.resolve(__dirname, '../prompts');
const FORMAT_PATH = path.join(PROMPTS_DIR, 'item-format.json');
const EXTRACT_PROMPT_PATH = path.join(PROMPTS_DIR, 'extract.md');
const SUPERVISOR_PROMPT_PATH = path.join(PROMPTS_DIR, 'supervisor.md');
const SHOPWARE_PROMPT_PATH = path.join(PROMPTS_DIR, 'shopware-verify.md');
const CATEGORIZER_PROMPT_PATH = path.join(PROMPTS_DIR, 'categorizer.md');
const JSON_CORRECTION_PROMPT_PATH = path.join(PROMPTS_DIR, 'json-correction.md');
const PRICING_PROMPT_PATH = path.join(PROMPTS_DIR, 'pricing.md');
const PRICING_RULES_PATH = path.join(PROMPTS_DIR, 'pricing-rules.md');
const SEARCH_PLANNER_PROMPT_PATH = path.join(PROMPTS_DIR, 'search-planner.md');
const SEARCH_SOURCES_PROMPT_PATH = path.join(PROMPTS_DIR, 'search-sources.md');
const CHAT_PROMPT_PATH = path.join(PROMPTS_DIR, 'chat.md');
const DB_SCHEMA_PATH = path.resolve(__dirname, '../../db.ts');
const CHAT_SCHEMA_TOKEN = '{{ITEM_DATABASE_SCHEMA}}';
const PROMPT_FRAGMENT_MAX_LENGTH = 400;

const SHARED_PROMPT_TOKENS = {
  baseRolePolicy: '{{BASE_ROLE_POLICY}}',
  outputContract: '{{OUTPUT_CONTRACT}}',
  errorPolicy: '{{ERROR_POLICY}}',
  productExamplePolicy: '{{PRODUCT_EXAMPLE_POLICY}}'
} as const;

export const PROMPT_TEMPLATE_VERSIONS = {
  baseRolePolicy: 'v1.0.0',
  outputContract: 'v1.0.0',
  errorPolicy: 'v1.0.0',
  productExamplePolicy: 'v1.0.0'
} as const;

const SHARED_PROMPT_FRAGMENTS: Record<(typeof SHARED_PROMPT_TOKENS)[keyof typeof SHARED_PROMPT_TOKENS], string> = {
  [SHARED_PROMPT_TOKENS.baseRolePolicy]:
    '- Follow only the provided evidence and reviewer instructions.\n- Keep role-specific behavior scoped to this stage; do not perform other pipeline stages implicitly.',
  [SHARED_PROMPT_TOKENS.outputContract]:
    '- Return only the requested output payload.\n- Do not prepend or append narrative text outside explicitly allowed sections.',
  [SHARED_PROMPT_TOKENS.errorPolicy]:
    '- If required information is missing, use the role-specific fallback (null/empty/fail) instead of inventing data.\n- Never fabricate unsupported facts.',
  [SHARED_PROMPT_TOKENS.productExamplePolicy]:
    '- Treat included examples as style/shape references; never copy product-specific claims unless they are present in the current input.'
};

export const PROMPT_PLACEHOLDERS = {
  categorizerReview: '{{CATEGORIZER_REVIEW}}',
  extractionReview: '{{EXTRACTION_REVIEW}}',
  supervisorReview: '{{SUPERVISOR_REVIEW}}',
  exampleItem: '{{EXAMPLE_ITEM}}',
  // TODO(agentic-schema-injection): Keep target schema placeholder naming aligned across all agent prompts.
  targetSchemaFormat: '{{TARGET_SCHEMA_FORMAT}}'
} as const;

export type PromptPlaceholderToken = (typeof PROMPT_PLACEHOLDERS)[keyof typeof PROMPT_PLACEHOLDERS];
export type PromptPlaceholderFragments = Map<PromptPlaceholderToken, string[]>;

type SchemaTable = {
  name: string;
  columns: string[];
  constraints: string[];
  indexes: string[];
};

// TODO(agent): Keep column usage notes aligned with db schema changes.
type ColumnNote = {
  note: string;
  aliases?: string[];
};

export const SCHEMA_COLUMN_NOTES: Record<string, Record<string, ColumnNote>> = {
  item_refs: {
    Artikel_Nummer: { note: 'Einzigartige nummer für Artikelreferenzen, als primary key benutzt', aliases: ['SKU'] },
    Suchbegriff: { note: 'Originaler Suchbegriff bzw. Referenzquery für den Artikel' },
    Grafikname: { note: 'Legacy Grafik-/Assetname für Druck oder Medienzuordnung' },
    ImageNames: { note: 'Comma-separated image list' },
    Artikelbeschreibung: { note: 'Produkt/Model name oder Name des jeweiligen Artikels' },
    Verkaufspreis: { note: 'Preis' },
    Kurzbeschreibung: { note: 'Kurzer Prosa Text für die Artikel Anzeige im Webshop' },
    // TODO(spezifikationen-prompts): Confirm Spezifikationen wording stays aligned with UI copy updates.
    Langtext: {
      note: 'Spezifikationen (Langtext): RichText in dem verschiedene Attribute zum Artikel als JSON formatiert vorliegen'
    },
    Hersteller: { note: 'Manufacturer label', aliases: ['brand'] },
    Länge_mm: { note: 'Length in millimeters', aliases: ['dimensions'] },
    Breite_mm: { note: 'Width in millimeters', aliases: ['dimensions'] },
    Höhe_mm: { note: 'Height in millimeters', aliases: ['dimensions'] },
    Gewicht_kg: { note: 'Weight in kilograms' },
    Hauptkategorien_A: { note: 'Grobkategorien' },
    Unterkategorien_A: { note: 'Unterkategorien' },
    Hauptkategorien_B: { note: 'Optional zweite Grobkategorie für Mehrfachzuordnung' },
    Unterkategorien_B: { note: 'Optional zweite Unterkategorie für Mehrfachzuordnung' },
    Veröffentlicht_Status: { note: 'Publication status' },
    Quality: { note: 'Optional quality/review state for enrichment outcomes' },
    Shopartikel: { note: 'Shop article flag' },
    Artikeltyp: { note: 'Product type' },
    Einheit: { note: 'Unit of measure' },
    EntityType: { note: 'Source entity type' },
    ShopwareProductId: { note: 'Shopware parent product id' }
  },
  items: {
    // TODO(agentic-schema): Keep ItemUUID out of prompt schema guidance while reference-only identifiers are required.
    Artikel_Nummer: { note: 'Primary reference identifier (Artikelnummer) for instance rows', aliases: ['SKU'] },
    BoxID: { note: 'Storage box id' },
    Location: { note: 'Free-form storage location' },
    UpdatedAt: { note: 'Last update timestamp' },
    Datum_erfasst: { note: 'Capture timestamp' },
    Auf_Lager: { note: 'Stock availability flag', aliases: ['stock'] },
    Quality: { note: 'Optional quality/review state for item instance data' },
    ShopwareVariantId: { note: 'Shopware variant id' }
  }
};

interface ReadPromptOptions {
  itemId: string;
  prompt: string;
  logger?: ItemFlowLogger;
}

interface ComposePromptTemplateOptions {
  promptName: string;
  promptTemplate: string;
  itemId: string;
  logger?: ItemFlowLogger;
}

// TODO(agentic-prompt-versions): Add compatibility aliases if fragment token names ever change.
export function composePromptTemplate({ promptName, promptTemplate, itemId, logger }: ComposePromptTemplateOptions): string {
  try {
    let rendered = promptTemplate;
    const appliedSharedFragments: string[] = [];

    for (const [token, fragment] of Object.entries(SHARED_PROMPT_FRAGMENTS)) {
      if (!rendered.includes(token)) {
        continue;
      }
      rendered = rendered.split(token).join(fragment);
      appliedSharedFragments.push(token);
    }

    logger?.debug?.({
      msg: 'prompt template composed',
      itemId,
      promptName,
      appliedSharedFragments,
      promptTemplateVersions: PROMPT_TEMPLATE_VERSIONS
    });

    return rendered;
  } catch (err) {
    logger?.warn?.({ err, msg: 'failed to compose prompt template; using unrendered template', itemId, promptName });
    return promptTemplate;
  }
}

function stripRoleLikePrefixes(value: string): string {
  const rolePrefixPattern = /^\s*(system|assistant|user|developer|tool)\s*:\s*/i;
  return value
    .split('\n')
    .map((line) => line.replace(rolePrefixPattern, '').trim())
    .filter(Boolean)
    .join('\n');
}

export function sanitizePromptFragment(notes: unknown, maxLength = PROMPT_FRAGMENT_MAX_LENGTH): string {
  try {
    if (typeof notes !== 'string') {
      return '';
    }
    const withoutCodeFences = notes.replace(/```[\s\S]*?```/g, ' ').replace(/`{1,3}/g, ' ');
    const withoutRolePrefixes = stripRoleLikePrefixes(withoutCodeFences);
    const condensed = withoutRolePrefixes.replace(/\s+/g, ' ').trim();
    if (!condensed) {
      return '';
    }
    return condensed.slice(0, Math.max(0, maxLength));
  } catch {
    return '';
  }
}

export function appendPlaceholderFragment(
  fragments: PromptPlaceholderFragments,
  placeholder: PromptPlaceholderToken,
  fragmentSource: unknown
): void {
  const sanitizedFragment = sanitizePromptFragment(fragmentSource);
  if (!sanitizedFragment) {
    return;
  }
  const existing = fragments.get(placeholder) ?? [];
  existing.push(sanitizedFragment);
  fragments.set(placeholder, existing);
}

export function resolvePromptPlaceholders({
  template,
  fragments,
  logger,
  itemId,
  stage
}: {
  template: string;
  fragments: PromptPlaceholderFragments;
  logger?: ItemFlowLogger;
  itemId: string;
  stage: string;
}): string {
  try {
    let assembled = template;
    const placeholderStats: Array<{ placeholder: PromptPlaceholderToken; count: number; totalLength: number }> = [];
    for (const placeholder of Object.values(PROMPT_PLACEHOLDERS)) {
      const placeholderFragments = fragments.get(placeholder) ?? [];
      const combined = placeholderFragments.join('\n');
      assembled = assembled.split(placeholder).join(combined);
      placeholderStats.push({
        placeholder,
        count: placeholderFragments.length,
        totalLength: combined.length
      });
    }
    logger?.debug?.({ msg: 'assembled prompt placeholders', itemId, stage, placeholderStats });
    return assembled;
  } catch (err) {
    logger?.warn?.({ err, msg: 'failed to assemble prompt placeholders', itemId, stage });
    let fallback = template;
    for (const placeholder of Object.values(PROMPT_PLACEHOLDERS)) {
      fallback = fallback.split(placeholder).join('');
    }
    return fallback;
  }
}

async function readPromptFile(promptPath: string, { itemId, prompt, logger }: ReadPromptOptions): Promise<string> {
  try {
    const content = await fs.readFile(promptPath, 'utf8');
    logger?.debug?.({ msg: 'prompt loaded', itemId, prompt, promptPath });
    return content;
  } catch (err) {
    logger?.error?.({ err, msg: 'failed to load prompt file', itemId, prompt, promptPath });
    throw err;
  }
}

// TODO(agent): Centralize SQL schema extraction so future prompt flows can reuse the same summaries without duplicating parsing.
function extractSchemaSql(source: string, constantName: string): string {
  const marker = `const ${constantName} = \``;
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error(`Schema constant not found: ${constantName}`);
  }

  const startIndex = source.indexOf('`', markerIndex + marker.length - 1);
  const endIndex = source.indexOf('`;', startIndex + 1);

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error(`Schema constant is malformed: ${constantName}`);
  }

  return source.slice(startIndex + 1, endIndex);
}

function parseTableBlocks(sql: string): SchemaTable[] {
  const tables: SchemaTable[] = [];
  const tableRegex = /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)\s*\(([\s\S]*?)\);/gim;
  let match: RegExpExecArray | null;
  while ((match = tableRegex.exec(sql)) !== null) {
    const [, name, body] = match;
    const columns: string[] = [];
    const constraints: string[] = [];
    const lines = body
      .split('\n')
      .map((line) => line.trim().replace(/,+$/, ''))
      .filter(Boolean);

    for (const line of lines) {
      if (/^(foreign key|primary key|unique)/i.test(line)) {
        constraints.push(line);
      } else {
        columns.push(line);
      }
    }

    tables.push({ name, columns, constraints, indexes: [] });
  }

  const indexRegex = /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+(\w+)\s+ON\s+(\w+)\s*\(([^)]+)\)/gim;
  let indexMatch: RegExpExecArray | null;
  while ((indexMatch = indexRegex.exec(sql)) !== null) {
    const [, indexName, tableName, indexBody] = indexMatch;
    const table = tables.find((candidate) => candidate.name === tableName);
    if (table) {
      table.indexes.push(`${indexName}(${indexBody.trim()})`);
    }
  }

  return tables;
}

function validateSchemaTables(tables: SchemaTable[]): void {
  const requiredTables = ['item_refs', 'items'];
  const missing = requiredTables.filter((table) => !tables.some((candidate) => candidate.name === table));
  if (missing.length > 0) {
    throw new FlowError('PROMPT_SCHEMA_VALIDATION_FAILED', 'Chat schema is missing required tables', 500, {
      context: { missing }
    });
  }

  const emptyTables = tables.filter((table) => table.columns.length === 0);
  if (emptyTables.length > 0) {
    throw new FlowError('PROMPT_SCHEMA_VALIDATION_FAILED', 'Chat schema is missing column definitions', 500, {
      context: { emptyTables: emptyTables.map(({ name }) => name) }
    });
  }
}

function annotateColumn(
  column: string,
  tableName: string,
  logger?: ItemFlowLogger
): { rendered: string; name?: string; foundNote: boolean } {
  const columnName = column.split(/\s+/)[0];
  const note = SCHEMA_COLUMN_NOTES[tableName]?.[columnName];
  if (!note || !columnName) {
    return { rendered: column, name: columnName, foundNote: false };
  }

  const aliasText = note.aliases?.length ? `; aliases: ${note.aliases.join('/')}` : '';
  const rendered = `${column} — use: ${note.note}${aliasText}`;
  logger?.debug?.({ msg: 'schema column annotated', tableName, columnName, hasAliases: Boolean(aliasText) });
  return { rendered, name: columnName, foundNote: true };
}

function formatSchemaTables(tables: SchemaTable[], logger?: ItemFlowLogger): string {
  return tables
    .map((table) => {
      const missingNotes: string[] = [];
      const filteredColumns =
        table.name === 'items'
          ? table.columns.filter((column) => !column.trim().startsWith('ItemUUID'))
          : table.columns;

      if (table.name === 'items' && filteredColumns.length !== table.columns.length) {
        logger?.info?.({
          msg: 'chat prompt schema filtered to omit instance identifiers',
          removedColumns: ['ItemUUID']
        });
      }

      const annotatedColumns = filteredColumns.map((column) => {
        const { rendered, name, foundNote } = annotateColumn(column, table.name, logger);
        if (!foundNote && name) {
          missingNotes.push(name);
        }
        return `  - ${rendered}`;
      });

      if (missingNotes.length > 0) {
        logger?.debug?.({ msg: 'schema column notes missing', table: table.name, missingNotes });
      }

      const lines = [`${table.name}:`, ...annotatedColumns];
      if (table.constraints.length > 0) {
        lines.push('  Constraints:');
        for (const constraint of table.constraints) {
          lines.push(`    - ${constraint}`);
        }
      }
      if (table.indexes.length > 0) {
        lines.push('  Indexes:');
        for (const index of table.indexes) {
          lines.push(`    - ${index}`);
        }
      }
      return lines.join('\n');
    })
    .join('\n\n');
}

async function buildChatSchemaSection(logger?: ItemFlowLogger): Promise<string> {
  try {
    const dbSource = await fs.readFile(DB_SCHEMA_PATH, 'utf8');
    logger?.debug?.({ msg: 'loaded db schema source for chat prompt', schemaPath: DB_SCHEMA_PATH });

    const itemRefSql = extractSchemaSql(dbSource, 'CREATE_ITEM_REFS_SQL');
    const itemsSql = extractSchemaSql(dbSource, 'CREATE_ITEMS_SQL');
    const tables = parseTableBlocks(`${itemRefSql}\n${itemsSql}`);

    validateSchemaTables(tables);
    const schemaText = formatSchemaTables(tables, logger);

    if (!schemaText.includes('item_refs') || !schemaText.includes('items')) {
      throw new FlowError('PROMPT_SCHEMA_VALIDATION_FAILED', 'Schema summary did not include required tables', 500, {
        context: { schemaPath: DB_SCHEMA_PATH }
      });
    }

    logger?.debug?.({
      msg: 'assembled chat schema section',
      tables: tables.map(({ name }) => name),
      annotatedColumns: tables.map(({ name, columns }) => ({ table: name, columnCount: columns.length }))
    });
    return schemaText;
  } catch (err) {
    logger?.error?.({ err, msg: 'failed to build chat schema section', schemaPath: DB_SCHEMA_PATH });
    if (err instanceof FlowError) {
      throw err;
    }
    throw new FlowError('PROMPT_SCHEMA_BUILD_FAILED', 'Failed to build chat schema section', 500, { cause: err });
  }
}

export interface LoadPromptsOptions {
  itemId: string;
  logger?: ItemFlowLogger;
  includeShopware?: boolean;
}

export interface LoadPromptsResult {
  format: string;
  extract: string;
  supervisor: string;
  categorizer: string;
  pricing: string;
  jsonCorrection: string;
  searchPlanner: string;
  shopware?: string | null;
}

export interface LoadChatPromptOptions {
  logger?: ItemFlowLogger;
}

export async function loadPrompts({ itemId, logger, includeShopware }: LoadPromptsOptions): Promise<LoadPromptsResult> {
  try {
    // TODO(agent): Revisit whether optional source context still improves planner quality telemetry.
    const [format, extractTemplate, supervisorTemplate, categorizerTemplate, pricingTemplate, pricingRules, searchPlannerTemplate, searchSources] = await Promise.all([
      readPromptFile(FORMAT_PATH, { itemId, prompt: 'format', logger }),
      readPromptFile(EXTRACT_PROMPT_PATH, { itemId, prompt: 'extract', logger }),
      readPromptFile(SUPERVISOR_PROMPT_PATH, { itemId, prompt: 'supervisor', logger }),
      readPromptFile(CATEGORIZER_PROMPT_PATH, { itemId, prompt: 'categorizer', logger }),
      readPromptFile(PRICING_PROMPT_PATH, { itemId, prompt: 'pricing', logger }),
      readPromptFile(PRICING_RULES_PATH, { itemId, prompt: 'pricing-rules', logger }),
      readPromptFile(SEARCH_PLANNER_PROMPT_PATH, { itemId, prompt: 'search-planner', logger }),
      readPromptFile(SEARCH_SOURCES_PROMPT_PATH, { itemId, prompt: 'search-sources', logger })
    ]);

    const extract = composePromptTemplate({ promptName: 'extract', promptTemplate: extractTemplate, itemId, logger });
    const supervisor = composePromptTemplate({
      promptName: 'supervisor',
      promptTemplate: supervisorTemplate,
      itemId,
      logger
    });
    const categorizer = composePromptTemplate({
      promptName: 'categorizer',
      promptTemplate: categorizerTemplate,
      itemId,
      logger
    });
    const pricing = composePromptTemplate({ promptName: 'pricing', promptTemplate: pricingTemplate, itemId, logger });
    const searchPlannerComposedTemplate = composePromptTemplate({
      promptName: 'search-planner',
      promptTemplate: searchPlannerTemplate,
      itemId,
      logger
    });

    const composedPricing = `${pricing.trim()}\n\n<pricing_rules>\n${pricingRules.trim()}\n</pricing_rules>\n`;

    const searchPlanner = `${searchPlannerComposedTemplate.trim()}\n\n<optional_sources_context>\n${searchSources.trim()}\n\nDo not force site filters or domain constraints from this list; use it only as optional context when needed.\n</optional_sources_context>\n`;

    logger?.debug?.({
      msg: 'search planner prompt composed with optional source context',
      itemId,
      sourcesLength: searchSources.length
    });

    let jsonCorrection: string;
    try {
      const jsonCorrectionTemplate = await readPromptFile(JSON_CORRECTION_PROMPT_PATH, {
        itemId,
        prompt: 'json-correction',
        logger
      });
      jsonCorrection = composePromptTemplate({
        promptName: 'json-correction',
        promptTemplate: jsonCorrectionTemplate,
        itemId,
        logger
      });
    } catch (err) {
      logger?.error?.({ err, msg: 'failed to load json correction prompt', itemId });
      throw err;
    }

    let shopware: string | null | undefined;
    if (includeShopware) {
      try {
        const shopwareTemplate = await readPromptFile(SHOPWARE_PROMPT_PATH, { itemId, prompt: 'shopware', logger });
        shopware = composePromptTemplate({ promptName: 'shopware', promptTemplate: shopwareTemplate, itemId, logger });
      } catch (err) {
        logger?.warn?.({ err, msg: 'shopware prompt unavailable', itemId });
        shopware = null;
      }
    }

    logger?.debug?.({
      msg: 'prompts bundle loaded',
      itemId,
      includeShopware: Boolean(includeShopware),
      hasJsonCorrection: Boolean(jsonCorrection),
      pricingRulesLength: pricingRules.length,
      hasShopware: shopware != null,
      promptTemplateVersions: PROMPT_TEMPLATE_VERSIONS
    });

    return { format, extract, supervisor, categorizer, pricing: composedPricing, jsonCorrection, searchPlanner, shopware };
  } catch (err) {
    if (err instanceof FlowError) {
      throw err;
    }
    logger?.error?.({ err, msg: 'failed to load prompts', itemId });
    throw new FlowError('PROMPT_LOAD_FAILED', 'Failed to load prompts', 500, { cause: err });
  }
}

export async function loadChatPrompt({ logger }: LoadChatPromptOptions = {}): Promise<string> {
  try {
    const [template, schemaSection] = await Promise.all([
      readPromptFile(CHAT_PROMPT_PATH, { itemId: 'chat', prompt: 'chat', logger }),
      buildChatSchemaSection(logger)
    ]);

    if (!template.includes(CHAT_SCHEMA_TOKEN)) {
      throw new FlowError('PROMPT_SCHEMA_TEMPLATE_MISSING', 'Chat prompt template missing schema token', 500, {
        context: { chatPromptPath: CHAT_PROMPT_PATH }
      });
    }

    const prompt = template.replace(CHAT_SCHEMA_TOKEN, schemaSection);

    if (!prompt.includes(schemaSection)) {
      throw new FlowError('PROMPT_SCHEMA_VALIDATION_FAILED', 'Chat prompt assembly failed schema injection', 500, {
        context: { chatPromptPath: CHAT_PROMPT_PATH }
      });
    }

    logger?.debug?.({ msg: 'chat prompt assembled', schemaLength: schemaSection.length });
    return prompt;
  } catch (err) {
    if (err instanceof FlowError) {
      throw err;
    }
    logger?.error?.({ err, msg: 'failed to load chat prompt' });
    throw new FlowError('PROMPT_LOAD_FAILED', 'Failed to load chat prompt', 500, { cause: err });
  }
}

export {
  FORMAT_PATH,
  EXTRACT_PROMPT_PATH,
  SUPERVISOR_PROMPT_PATH,
  SHOPWARE_PROMPT_PATH,
  CATEGORIZER_PROMPT_PATH,
  PRICING_PROMPT_PATH,
  PRICING_RULES_PATH,
  JSON_CORRECTION_PROMPT_PATH,
  SEARCH_PLANNER_PROMPT_PATH,
  CHAT_PROMPT_PATH
};
