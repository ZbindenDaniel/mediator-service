import {
  sanitizePromptFragment,
  appendPlaceholderFragment,
  resolvePromptPlaceholders,
  composePromptTemplate,
  PROMPT_PLACEHOLDERS,
  type PromptPlaceholderFragments
} from '../flow/prompts';

describe('sanitizePromptFragment', () => {
  it('returns empty string for non-string input', () => {
    expect(sanitizePromptFragment(null)).toBe('');
    expect(sanitizePromptFragment(42)).toBe('');
    expect(sanitizePromptFragment(undefined)).toBe('');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(sanitizePromptFragment('   ')).toBe('');
    expect(sanitizePromptFragment('\n\t')).toBe('');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizePromptFragment('')).toBe('');
  });

  it('strips code fences from the fragment', () => {
    const result = sanitizePromptFragment('Check ```this value``` carefully.');
    expect(result).not.toContain('```');
  });

  it('removes role-like prefixes from each line', () => {
    const result = sanitizePromptFragment('system: do this\nuser: and that');
    expect(result).not.toMatch(/^system:/im);
    expect(result).not.toMatch(/^user:/im);
  });

  it('condenses repeated whitespace into single spaces', () => {
    const result = sanitizePromptFragment('too   many   spaces');
    expect(result).toBe('too many spaces');
  });

  it('truncates to the default max length', () => {
    const long = 'a'.repeat(500);
    const result = sanitizePromptFragment(long);
    expect(result.length).toBeLessThanOrEqual(400);
  });

  it('respects a custom maxLength', () => {
    const result = sanitizePromptFragment('hello world', 5);
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it('passes through a normal short string', () => {
    expect(sanitizePromptFragment('Verify dimensions carefully.')).toBe('Verify dimensions carefully.');
  });
});

describe('appendPlaceholderFragment', () => {
  const makeFragments = (): PromptPlaceholderFragments => new Map();

  it('adds a fragment to an empty map', () => {
    const fragments = makeFragments();
    appendPlaceholderFragment(fragments, PROMPT_PLACEHOLDERS.extractionReview, 'check dimensions');
    expect(fragments.get(PROMPT_PLACEHOLDERS.extractionReview)).toEqual(['check dimensions']);
  });

  it('accumulates multiple fragments under the same placeholder', () => {
    const fragments = makeFragments();
    appendPlaceholderFragment(fragments, PROMPT_PLACEHOLDERS.supervisorReview, 'first note');
    appendPlaceholderFragment(fragments, PROMPT_PLACEHOLDERS.supervisorReview, 'second note');
    expect(fragments.get(PROMPT_PLACEHOLDERS.supervisorReview)).toHaveLength(2);
  });

  it('ignores empty or non-string fragments', () => {
    const fragments = makeFragments();
    appendPlaceholderFragment(fragments, PROMPT_PLACEHOLDERS.extractionReview, '');
    appendPlaceholderFragment(fragments, PROMPT_PLACEHOLDERS.extractionReview, null);
    appendPlaceholderFragment(fragments, PROMPT_PLACEHOLDERS.extractionReview, 42);
    expect(fragments.has(PROMPT_PLACEHOLDERS.extractionReview)).toBe(false);
  });

  it('sanitizes the fragment before inserting', () => {
    const fragments = makeFragments();
    appendPlaceholderFragment(fragments, PROMPT_PLACEHOLDERS.categorizerReview, 'system: check this');
    const inserted = fragments.get(PROMPT_PLACEHOLDERS.categorizerReview)?.[0] ?? '';
    expect(inserted).not.toMatch(/^system:/i);
  });
});

describe('resolvePromptPlaceholders', () => {
  it('replaces a placeholder with the joined fragments', () => {
    const template = `Before {{EXTRACTION_REVIEW}} After`;
    const fragments: PromptPlaceholderFragments = new Map([
      [PROMPT_PLACEHOLDERS.extractionReview, ['fragment one', 'fragment two']]
    ]);
    const result = resolvePromptPlaceholders({ template, fragments, itemId: 'X', stage: 'test' });
    expect(result).toBe('Before fragment one\nfragment two After');
  });

  it('removes placeholder tokens when no fragments are registered', () => {
    const template = `Header {{SUPERVISOR_REVIEW}} Footer`;
    const result = resolvePromptPlaceholders({
      template,
      fragments: new Map(),
      itemId: 'X',
      stage: 'test'
    });
    expect(result).toBe('Header  Footer');
  });

  it('replaces all placeholder types in a single pass', () => {
    const template = `A={{EXTRACTION_REVIEW}} B={{SUPERVISOR_REVIEW}}`;
    const fragments: PromptPlaceholderFragments = new Map([
      [PROMPT_PLACEHOLDERS.extractionReview, ['ext']],
      [PROMPT_PLACEHOLDERS.supervisorReview, ['sup']]
    ]);
    const result = resolvePromptPlaceholders({ template, fragments, itemId: 'X', stage: 'test' });
    expect(result).toBe('A=ext B=sup');
  });

  it('handles templates with no placeholders unchanged', () => {
    const template = 'Static text only.';
    const result = resolvePromptPlaceholders({ template, fragments: new Map(), itemId: 'X', stage: 'test' });
    expect(result).toBe('Static text only.');
  });
});

describe('composePromptTemplate', () => {
  it('leaves a template without shared tokens unchanged', () => {
    const template = 'Plain prompt text.';
    const result = composePromptTemplate({ promptName: 'test', promptTemplate: template, itemId: 'X' });
    expect(result).toBe(template);
  });

  it('injects the base role policy fragment when the token is present', () => {
    const template = 'Rules: {{BASE_ROLE_POLICY}} end.';
    const result = composePromptTemplate({ promptName: 'test', promptTemplate: template, itemId: 'X' });
    expect(result).not.toContain('{{BASE_ROLE_POLICY}}');
    expect(result.length).toBeGreaterThan(template.length);
  });

  it('injects the output contract fragment', () => {
    const template = 'Contract: {{OUTPUT_CONTRACT}}';
    const result = composePromptTemplate({ promptName: 'test', promptTemplate: template, itemId: 'X' });
    expect(result).not.toContain('{{OUTPUT_CONTRACT}}');
  });

  it('replaces multiple shared tokens in one call', () => {
    const template = '{{BASE_ROLE_POLICY}} and {{ERROR_POLICY}}';
    const result = composePromptTemplate({ promptName: 'test', promptTemplate: template, itemId: 'X' });
    expect(result).not.toContain('{{BASE_ROLE_POLICY}}');
    expect(result).not.toContain('{{ERROR_POLICY}}');
  });
});
