# frontend/

## Purpose
React single-page application — item and box management UI, quality review, agentic monitoring, printing, admin, and help pages.

## Contents
- `src/` — all application source code
  - `components/` — React components (see `components/README.md`)
  - `context/` — React context providers (app state, auth, scan mode)
  - `data/` — API client functions (fetch wrappers per endpoint)
  - `lib/` — shared frontend utilities (formatting, URL helpers)
  - `utils/` — pure utility functions (filtering, sorting, text)
  - `assets/` — static assets (icons, images)
  - `index.tsx` — application entry point
- `public/` — static files served directly
  - `print/` — print-preview HTML templates

## Relations
- Communicates with: `../backend` via HTTP `GET/POST /api/*`
- Shares types with: `../models` (TypeScript interfaces imported at build time)
- No direct DB access

## Scope
Presentation layer only. Data fetching through `data/` API clients. No business logic (validation, calculations, etc.) — those belong in backend or models.

## Rules
- New API calls go in `data/` — not inline in components
- Global state goes in `context/` — not prop-drilled through component trees
- Components in `components/` are named by what they render, not what action triggers them

## Decisions
- **React SPA (no SSR)**: the app is operator-facing on a LAN; SEO irrelevant; full SPA gives simpler deployment alongside the Express backend
- **No component framework (no MUI/Shadcn)**: custom CSS for precise control over label-printing and mobile-first layout without fighting framework defaults

## See also
- [docs/detailed/item-detail-layout.md](../docs/detailed/item-detail-layout.md) — UX hierarchy for the item detail page
