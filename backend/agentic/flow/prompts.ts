import fs from 'fs/promises';
import path from 'path';
import { FlowError } from './errors';
import type { ItemFlowLogger } from './item-flow';

const PROMPTS_DIR = path.resolve(__dirname, '../prompts');
const FORMAT_PATH = path.join(PROMPTS_DIR, 'item-format.json');
const EXTRACT_PROMPT_PATH = path.join(PROMPTS_DIR, 'extract.md');
const SUPERVISOR_PROMPT_PATH = path.join(PROMPTS_DIR, 'supervisor.md');
const SHOPWARE_PROMPT_PATH = path.join(PROMPTS_DIR, 'shopware-verify.md');
const CATEGORIZER_PROMPT_PATH = path.join(PROMPTS_DIR, 'categorizer.md');

interface ReadPromptOptions {
  itemId: string;
  prompt: string;
  logger?: ItemFlowLogger;
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
  shopware?: string | null;
}

export async function loadPrompts({ itemId, logger, includeShopware }: LoadPromptsOptions): Promise<LoadPromptsResult> {
  try {
    const [format, extract, supervisor, categorizer] = await Promise.all([
      readPromptFile(FORMAT_PATH, { itemId, prompt: 'format', logger }),
      readPromptFile(EXTRACT_PROMPT_PATH, { itemId, prompt: 'extract', logger }),
      readPromptFile(SUPERVISOR_PROMPT_PATH, { itemId, prompt: 'supervisor', logger }),
      readPromptFile(CATEGORIZER_PROMPT_PATH, { itemId, prompt: 'categorizer', logger })
    ]);

    let shopware: string | null | undefined;
    if (includeShopware) {
      try {
        shopware = await readPromptFile(SHOPWARE_PROMPT_PATH, { itemId, prompt: 'shopware', logger });
      } catch (err) {
        logger?.warn?.({ err, msg: 'shopware prompt unavailable', itemId });
        shopware = null;
      }
    }

    return { format, extract, supervisor, categorizer, shopware };
  } catch (err) {
    if (err instanceof FlowError) {
      throw err;
    }
    logger?.error?.({ err, msg: 'failed to load prompts', itemId });
    throw new FlowError('PROMPT_LOAD_FAILED', 'Failed to load prompts', 500, { cause: err });
  }
}

export { FORMAT_PATH, EXTRACT_PROMPT_PATH, SUPERVISOR_PROMPT_PATH, SHOPWARE_PROMPT_PATH, CATEGORIZER_PROMPT_PATH };
