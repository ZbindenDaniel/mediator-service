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
