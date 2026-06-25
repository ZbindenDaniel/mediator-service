# backend/agentic/prompts/

## Purpose
LLM prompt template files — markdown instruction files and JSON format examples injected into model calls.

## Contents
- `extract.md` — extraction stage: instructs the model to identify product specs from search results
- `search-planner.md` — search stage: directs query planning for product research
- `search-sources.md` — search stage: source quality and selection guidance
- `categorizer.md` — categorization stage: taxonomy assignment instructions
- `pricing.md` — pricing stage: market price estimation instructions
- `pricing-rules.md` — pricing constraints and guardrails
- `supervisor.md` — supervisor stage: validates extraction output, triggers re-extraction if needed
- `shopware-verify.md` — Shopware match verification instructions
- `chat.md` — chat assistant system prompt
- `schema-contract.md` — injected spec contract context for constrained extraction
- `item-format.json` — example item JSON structure for few-shot context
- `json-correction.md` — instructions for JSON repair pass when model output is malformed

## Rules
- Prompts are plain markdown — no inline TypeScript template literals in production code
- Changes to prompts should be tested against the affected stage before deploying
- `pricing-rules.md` is injected as a constraint block — keep it short and unambiguous

## Decisions
- **Markdown files over code strings**: prompt content is decoupled from code; can be reviewed, diffed, and iterated without touching TypeScript
- **Separate supervisor prompt**: rather than making the extraction prompt more complex, a dedicated supervisor stage re-validates output; easier to tune independently
