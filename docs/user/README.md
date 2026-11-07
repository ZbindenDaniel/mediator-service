# docs/user/

German end-user help pages, served by `/api/user-docs` and rendered on `/hilfe` (`frontend/src/components/HilfePage.tsx`). This README itself is never served.

## Contents
- `N_Name.md` — one help page each; the `N_` prefix sets the sidebar order (sorted numerically, so `10_` comes after `9_`). The first line `# Title` is the sidebar label.

## Feature gating
Pages and sections follow the deployment's feature flags ([`docs/detailed/feature-flags.md`](../detailed/feature-flags.md)). Markers are HTML comments on their **own line**:

```markdown
# KI-Cockpit
<!-- feature: agentic -->            ← whole page: hidden from the list + 404 when off

<!-- if-feature: stubs -->           ← section: stripped server-side when off
…
<!-- end-feature -->
```

- Several keys (`stubs, logs`) mean *all* must be on. Sections may nest.
- Markers inside table rows work (one row per section) — the server removes them before rendering.
- Inline markers inside a sentence do **not** work; split the sentence.
- Unknown keys count as off; `backend/__tests__/user-docs.test.ts` fails on typos and unbalanced markers.

## Rules
- Write in informal German ("du"), name UI labels exactly as the UI shows them (in **bold**). Swiss spelling: `ss`, not `ß` (except inside a quoted UI label).
- **Information first, plain words.** Say what a thing is, when to use it, the steps, and the result. Short sentences; one fact per sentence; tables for "field → meaning".
- **No filler or mood:** no "Willkommen!", "Keine Panik", "praktisch", "blitzschnell", "gratuliere", jokes or rhetorical questions. No em-dash asides — use a period or colon.
- **Don't anthropomorphise the AI.** Not "die KI lernt / denkt / weiss", but what happens: "Das Feedback wird dem nächsten Lauf als Anweisung mitgegeben." Call it a **KI-Lauf**, not "die KI".
- Explain internal terms once (e.g. Self-Heal, Queue, veraltet) in a short "Begriffe" table instead of using them unexplained.
- Check every label and number against the component before writing it down.
- Don't number `##` sections on pages with gated sections, and refer to other sections by name — a hidden section would leave a gap ("Abschnitt 7" pointing to nothing).
- Link other pages as `[Titel](/hilfe?doc=N_Name)`; if the target page is gated, gate the link too.

## Relations
- Served by: `backend/server.ts` (`/api/user-docs`) via `backend/lib/userDocs.ts`
- Rendered by: `frontend/src/components/HilfePage.tsx`
- Changelog: [`docs/changelogs/ui.md`](../changelogs/ui.md)
