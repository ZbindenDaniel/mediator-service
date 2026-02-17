import fs from 'fs';
import path from 'path';
// TODO(agentic-review-prompts): Extend placeholder coverage when stage-specific triggers are introduced.
import {
  appendPlaceholderFragment,
  PROMPT_PLACEHOLDERS,
  resolvePromptPlaceholders,
  sanitizePromptFragment,
  type PromptPlaceholderFragments
} from '../flow/prompts';

describe('prompt placeholder assembly', () => {
  it('appends multiple trigger fragments for the same placeholder without overwrite', () => {
    const fragments: PromptPlaceholderFragments = new Map();

    appendPlaceholderFragment(fragments, PROMPT_PLACEHOLDERS.extractionReview, 'first hint');
    appendPlaceholderFragment(fragments, PROMPT_PLACEHOLDERS.extractionReview, 'second hint');

    const resolved = resolvePromptPlaceholders({
      template: `Before\n${PROMPT_PLACEHOLDERS.extractionReview}\nAfter`,
      fragments,
      itemId: 'item-1',
      stage: 'extraction'
    });

    expect(resolved).toContain('first hint\nsecond hint');
  });

  it('falls back to empty fragments when no trigger data is available', () => {
    const fragments: PromptPlaceholderFragments = new Map();

    appendPlaceholderFragment(fragments, PROMPT_PLACEHOLDERS.extractionReview, null);
    appendPlaceholderFragment(fragments, PROMPT_PLACEHOLDERS.supervisorReview, '   ');

    const resolved = resolvePromptPlaceholders({
      template: `${PROMPT_PLACEHOLDERS.extractionReview}|${PROMPT_PLACEHOLDERS.supervisorReview}`,
      fragments,
      itemId: 'item-2',
      stage: 'supervisor'
    });

    expect(resolved).toBe('|');
  });

  it('strips role prefixes and code fences from note fragments', () => {
    const sanitized = sanitizePromptFragment('assistant: ```json\\n{"a":1}\\n``` Keep width details.');
    expect(sanitized).toBe('Keep width details.');
  });


  it('injects raw example placeholder blocks without sanitizing multiline JSON', () => {
    const fragments: PromptPlaceholderFragments = new Map();
    const exampleBlock = 'Reviewed example item (redacted):\n```json\n{\n  "Spezifikationen": {"RAM": ["DDR5"]}\n}\n```';
    fragments.set(PROMPT_PLACEHOLDERS.exampleItem, [exampleBlock]);

    const resolved = resolvePromptPlaceholders({
      template: `Examples:\n${PROMPT_PLACEHOLDERS.exampleItem}`,
      fragments,
      itemId: 'item-4',
      stage: 'extraction'
    });

    expect(resolved).toContain(exampleBlock);
  });


  it('includes reviewer placeholders in stage prompt templates', () => {
    const extractTemplate = fs.readFileSync(path.resolve(__dirname, '../prompts/extract.md'), 'utf8');
    const categorizerTemplate = fs.readFileSync(path.resolve(__dirname, '../prompts/categorizer.md'), 'utf8');
    const supervisorTemplate = fs.readFileSync(path.resolve(__dirname, '../prompts/supervisor.md'), 'utf8');

    expect(extractTemplate).toContain(PROMPT_PLACEHOLDERS.extractionReview);
    expect(categorizerTemplate).toContain(PROMPT_PLACEHOLDERS.categorizerReview);
    expect(supervisorTemplate).toContain(PROMPT_PLACEHOLDERS.supervisorReview);
  });

  it('replaces reviewer placeholders for extraction, categorizer, and supervisor stages', () => {
    const fragments: PromptPlaceholderFragments = new Map();
    fragments.set(PROMPT_PLACEHOLDERS.extractionReview, ['Extraction reviewer focus']);
    fragments.set(PROMPT_PLACEHOLDERS.categorizerReview, ['Categorizer reviewer focus']);
    fragments.set(PROMPT_PLACEHOLDERS.supervisorReview, ['Supervisor reviewer focus']);

    const extractTemplate = fs.readFileSync(path.resolve(__dirname, '../prompts/extract.md'), 'utf8');
    const categorizerTemplate = fs.readFileSync(path.resolve(__dirname, '../prompts/categorizer.md'), 'utf8');
    const supervisorTemplate = fs.readFileSync(path.resolve(__dirname, '../prompts/supervisor.md'), 'utf8');

    const assembledExtraction = resolvePromptPlaceholders({
      template: extractTemplate,
      fragments,
      itemId: 'item-stage-extract',
      stage: 'extraction'
    });
    const assembledCategorizer = resolvePromptPlaceholders({
      template: categorizerTemplate,
      fragments,
      itemId: 'item-stage-categorizer',
      stage: 'categorizer'
    });
    const assembledSupervisor = resolvePromptPlaceholders({
      template: supervisorTemplate,
      fragments,
      itemId: 'item-stage-supervisor',
      stage: 'supervisor'
    });

    expect(assembledExtraction).toContain('Extraction reviewer focus');
    expect(assembledExtraction).not.toContain(PROMPT_PLACEHOLDERS.extractionReview);

    expect(assembledCategorizer).toContain('Categorizer reviewer focus');
    expect(assembledCategorizer).not.toContain(PROMPT_PLACEHOLDERS.categorizerReview);

    expect(assembledSupervisor).toContain('Supervisor reviewer focus');
    expect(assembledSupervisor).not.toContain(PROMPT_PLACEHOLDERS.supervisorReview);
  });

  it('degrades gracefully to empty fragments when sanitizer/assembly fails', () => {
    const badFragments = {
      get: () => {
        throw new Error('broken-map');
      }
    } as unknown as PromptPlaceholderFragments;

    const resolved = resolvePromptPlaceholders({
      template: `A ${PROMPT_PLACEHOLDERS.extractionReview} B`,
      fragments: badFragments,
      itemId: 'item-3',
      stage: 'extraction'
    });

    expect(resolved).toBe('A  B');
  });
});
