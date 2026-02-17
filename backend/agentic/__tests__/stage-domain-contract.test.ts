import fs from 'fs';
import path from 'path';

describe('agentic stage domain contracts', () => {
  it('keeps extraction prompt restricted to evidence-only attributes and no taxonomy ownership', () => {
    const extractPromptPath = path.resolve(__dirname, '../prompts/extract.md');
    const extractPrompt = fs.readFileSync(extractPromptPath, 'utf8');

    expect(extractPrompt).toContain('Scope: extraction is evidence-only. Do not infer, assign, or validate taxonomy categories in this stage.');
    expect(extractPrompt).toContain('Category fields (`Hauptkategorien_A`, `Unterkategorien_A`, `Hauptkategorien_B`, `Unterkategorien_B`) are categorizer-owned and must not be present in extraction output.');
  });

  it('keeps supervisor prompt focused on current-stage deliverables', () => {
    const supervisorPromptPath = path.resolve(__dirname, '../prompts/supervisor.md');
    const supervisorPrompt = fs.readFileSync(supervisorPromptPath, 'utf8');

    expect(supervisorPrompt).toContain('Stage scope: evaluate only the current step deliverable.');
    expect(supervisorPrompt).toContain('Do not fail extraction due to taxonomy/category completeness.');
  });
});
