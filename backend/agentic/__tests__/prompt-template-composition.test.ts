import fs from 'fs';
import path from 'path';

import { composePromptTemplate, PROMPT_TEMPLATE_VERSIONS } from '../flow/prompts';

const PROMPTS_DIR = path.resolve(__dirname, '../prompts');

const PROMPT_FIXTURES = [
  'extract.md',
  'supervisor.md',
  'categorizer.md',
  'pricing.md',
  'shopware-verify.md',
  'search-planner.md',
  'json-correction.md'
] as const;

describe('prompt template composition snapshots', () => {
  it('exposes stable shared prompt fragment versions', () => {
    expect(PROMPT_TEMPLATE_VERSIONS).toMatchInlineSnapshot(`
{
  "baseRolePolicy": "v1.0.0",
  "errorPolicy": "v1.0.0",
  "outputContract": "v1.0.0",
  "productExamplePolicy": "v1.0.0",
}
`);
  });

  it.each(PROMPT_FIXTURES)('renders %s with shared fragments and no unresolved shared tokens', (promptFile) => {
    const raw = fs.readFileSync(path.join(PROMPTS_DIR, promptFile), 'utf8');
    const rendered = composePromptTemplate({
      promptName: promptFile,
      promptTemplate: raw,
      itemId: `snapshot-${promptFile}`
    });

    expect(rendered).not.toContain('{{BASE_ROLE_POLICY}}');
    expect(rendered).not.toContain('{{OUTPUT_CONTRACT}}');
    expect(rendered).not.toContain('{{ERROR_POLICY}}');
    expect(rendered).not.toContain('{{PRODUCT_EXAMPLE_POLICY}}');
    expect(rendered).toMatchSnapshot();
  });
});
