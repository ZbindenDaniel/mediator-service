Here’s a single markdown file you can save in the repo (e.g., `MIGRATION_TODO_FASTIFY_ZOD_TAILWIND.md`). Use it later to prompt me (paste it back and say “let’s start”).

---

# Migration TODO: Fastify + Zod + Tailwind (no React)

**Status:** Not started
**Intent:** Replace the ad-hoc HTTP server with Fastify, add Zod validation at API edges, and standardize styling with Tailwind. Keep SQLite/CSV/printing as-is.
**Trigger phrase to resume later:** *“Start the Fastify/Zod/Tailwind migration using the plan in MIGRATION\_TODO\_FASTIFY\_ZOD\_TAILWIND.md.”*

---

## 0) Scope & Constraints

* No React, no SSR.
* Preserve current routes, behavior, and HTML output.
* One-command run remains (`npm start`).
* Keep CSV watcher, print worker, DB module intact.

---

## 1) Packages to add (later)

```bash
npm i fastify @fastify/static @fastify/formbody
npm i zod fastify-type-provider-zod
# Tailwind: decide approach later (see §4)
```

---

## 2) Files to create (later)

* `app.js` — builds and returns a Fastify instance; registers plugins and routes.
* `routes.js` — maps all existing `/api/*` and `/ui/*` handlers into Fastify routes.
* `server-fastify.js` — starts the Fastify app (replaces `server.js` when we flip).
* `schemas.js` — Zod schemas for endpoint inputs (start with the critical ones).
* (Tailwind path B) `tailwind.config.js`, `assets/tailwind.css` → compiled to `public/styles.scss`.

---

## 3) Route mapping checklist

Mirror existing behavior:

* `GET /` → serve `public/index.html` (via `@fastify/static`).
* `GET /ui/import` → serve `public/import.html`.
* `GET /ui/box/:id` — server-rendered HTML (action view still uses `actions/*`).
* `GET /ui/item/:uuid` — server-rendered HTML.
* `POST /ui/api/import/item` — single item upsert (UUID auto-gen if missing).
* `POST /ui/api/item/:uuid/move` — relocate item.
* `POST /ui/api/(box|item)/:id/edit` — edit endpoints.
* `POST /api/import` — write CSV into inbox dir.
* `POST /api/validate-csv` — parse + validate CSV (returns issues).
* `GET /api/boxes` — list boxes.
* `GET /api/boxes/:id` — box detail + items + events.
* `GET /api/items/:uuid` — item detail + events.
* `GET /api/search?material=…` — search by material.
* `POST /api/boxes/:id/move` — set location.
* `GET /api/overview` — counts + recent boxes + recent events.
* `GET /api/test` — print test (or preview).
* `POST /api/print/box/:boxId` — print box (or preview).
* `GET /prints/*` — serve PDF previews (static).

> Keep `/public` served by `@fastify/static`; remove ad-hoc fs reads for `/styles.scss` and `/prints/*`.

---

## 4) Tailwind adoption plan (pick B now; C later if needed)

**A. CDN (trial only):** Skip for production (no purge).
**B. Standalone CLI (recommended first):** No bundler; compile to `public/styles.scss`.

* `tailwind.config.js` → `content: ["./public/**/*.html", "./actions/**/*.js"]`
* `assets/tailwind.css` with `@tailwind base; @tailwind components; @tailwind utilities;`
* Compile: `./tailwindcss -i ./assets/tailwind.css -o ./public/styles.scss --min`
  **C. Node package:** `npm i -D tailwindcss` and add an npm script; same inputs/outputs as B.

Adopt gradually: replace bespoke classes with Tailwind utilities for forms, grids, buttons, spacing. Keep existing CSS until parity.

---

## 5) Zod validation targets

Create `schemas.js` with (initial set):

```js
// Pseudocode shape; implement later
const itemUpsertSchema = z.object({
  BoxID: z.string().min(1),
  ItemUUID: z.string().uuid().optional(), // server generates if absent
  MaterialNumber: z.string().optional(),
  Description: z.string().optional(),
  Qty: z.preprocess(v => parseInt(String(v ?? "1"), 10), z.number().int().nonnegative().default(1)),
  ItemNotes: z.string().optional()
});

const moveItemSchema = z.object({
  toBoxId: z.string().min(1),
  actor: z.string().optional()
});

const placeBoxSchema = z.object({
  location: z.string().min(1),
  actor: z.string().optional(),
  notes: z.string().optional()
});

// Optional: CSV row schema if we normalize CSV fields before ingest
const csvRowSchema = z.object({
  BoxID: z.string().min(1),
  ItemUUID: z.string().min(1), // allow empty only if we plan to autogen during import
  MaterialNumber: z.string().optional(),
  Description: z.string().optional(),
  Condition: z.string().optional(),
  Qty: z.preprocess(v => parseInt(String(v ?? "1"), 10), z.number().int().nonnegative().default(1)),
  WmsLink: z.string().url().optional(),
  AttributesJson: z.string().optional(),
  AddedAt: z.string().optional(),
  Location: z.string().optional(),
  ItemNotes: z.string().optional()
});
```

Use `safeParse()` inside handlers; return `400` with `issues` on failure.

---

## 6) Minimal Fastify wiring (later)

* `@fastify/formbody` for form posts (`application/x-www-form-urlencoded`).
* `@fastify/static` for `/public` files (HTML, CSS, prints).
* Optional: set Fastify’s Zod type provider (useful if we later move to TypeScript).

---

## 7) Testing plan (later)

1. Hit each endpoint (pre/post migration) and diff JSON shapes.
2. CSV flow: validate + import a known file; confirm DB counts and recent activity match.
3. UI smoke: landing stats/events, import form, action views, print card with printer configured & unconfigured (preview created).
4. Mobile check (≤ 414px): inputs don’t overlap; tap targets ≥ 44px.

---

## 8) Rollback plan

* Keep `server.js` intact for one release.
* Start script can be switched back to `node server.js` instantly if needed.

---

## 9) Open questions (decide later)

* Do we add OpenAPI (`@fastify/swagger`) driven from Zod or keep docs light?
* Do we add rate-limiting or IP allowlist for write endpoints?
* Tailwind: keep standalone CLI or move to Node package build?

---

## 10) Acceptance criteria

* `npm start` launches Fastify server.
* All routes respond with the same payloads/HTML as before.
* Zod validation active for `/ui/api/import/item`, `/ui/api/item/:uuid/move`, `/api/boxes/:id/move`, and (optionally) CSV rows.
* Tailwind CSS applied to forms and cards without layout regressions on mobile.
* Printing behavior unchanged (including PDF fallback and activity log).

---

**When ready, paste this file back and say:**

> “Start the Fastify/Zod/Tailwind migration using the plan in MIGRATION\_TODO\_FASTIFY\_ZOD\_TAILWIND.md.”
