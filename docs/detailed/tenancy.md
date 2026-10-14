# Tenancy — current state & how to drive it

> [!NOTE]
> **Status (as of this doc):** identity resolution + `TenantId` stamping are **live**; tenant
> **isolation is NOT enforced yet**. Everyone still sees everything. See
> [`docs/PLANNING_TENANCY.md`](../PLANNING_TENANCY.md) for the phase plan — this file is the
> operator's companion to it: what works today, why `tenant` is `null`, and how to make it
> non-null so you can test.

## In short

- The backend resolves an **identity** for every request at the dispatch chokepoint and puts it on
  `ctx.identity`: `{ authenticated, username, groups, tenant, role }`.
- `GET /api/whoami` echoes that identity back — your window into what the backend thinks.
- New **items** and **boxes** get stamped with `TenantId` on create, taken from `ctx.identity.tenant`.
- Nothing **filters** on `TenantId` yet (that's Phase 3). Stamping is behaviour-neutral: it only
  fills a column.

## Why `tenant` is `null` right now

`tenant` is resolved by [`backend/lib/identity.ts`](../../backend/lib/identity.ts) and depends on **two**
things, neither of which is present on a plain local run:

1. **Forward-auth headers.** The reverse proxy (Authentik outpost) injects `X-authentik-username`
   and `X-authentik-groups`. With no proxy wired, there are no such headers, so the request is
   `authenticated: false`.
2. **A configured group map.** Even unauthenticated, the resolver will surface a
   **`defaultTenant`** if one is set in `TENANT_GROUP_MAP` / `TENANT_GROUP_MAP_FILE`. With no map,
   `defaultTenant` is `null`.

So out of the box: no headers **and** no map ⇒ `tenant: null`, `role: null`. That's the empty
single-tenant baseline. You make it non-null by supplying one or both of the above (below).

## The model: Authentik groups → tenant ids

> **You don't "create a tenant" in Authentik.** Authentik only knows **users** and **groups**. A
> *tenant* is an app-side concept: a config entry that maps an **Authentik group** to a **tenant id**.

```
Authentik group  "tenant-revamp"        ─┐
Authentik group  "tenant-revamp-admin"  ─┤  TENANT_GROUP_MAP (config)   backend ctx
Authentik group  "mediator-admin"       ─┴─────────────────────────▶   { tenant, role }
```

The config map (`TENANT_GROUP_MAP` inline JSON, or a file via `TENANT_GROUP_MAP_FILE`):

```jsonc
{
  "platformAdminGroup": "mediator-admin",          // members → role "platform-admin" (cross-tenant)
  "tenants": [
    {
      "id": "revamp",                               // the tenant id stamped onto rows
      "label": "revamp-it",                         // display name, seeded into the tenants table
      "group": "tenant-revamp",                     // members → tenant "revamp", role "normal"
      "superGroup": "tenant-revamp-admin"           // members → tenant "revamp", role "super"
    }
  ],
  "defaultTenant": "revamp"                          // fallback tenant when no group matches / no auth
}
```

Resolution logic (`resolveIdentity`), per request:

| Condition | `tenant` | `role` |
|---|---|---|
| No `X-authentik-username` header | `defaultTenant` (may be `null`) | `null` (unauthenticated) |
| In `platformAdminGroup` | matched / default | `platform-admin` |
| In a tenant's `superGroup` | that tenant | `super` |
| In a tenant's `group` | that tenant | `normal` |
| Authenticated but no group matches | `defaultTenant` | `normal` if a tenant resolved, else `null` |

The **`tenants` DB table** is the org directory (#971): name, contact email, linked Authentik
group(s), active flag, plus its **sites** (`tenant_sites`). It is edited on *Administration →
Organisationen verwalten* and **drives resolution**: once loaded, logins resolve through the DB's
group links instead of the config map's `tenants`. The config map seeds it on first start
(insert-if-missing; admin edits win) and keeps `platformAdminGroup` + `defaultTenant`. Step by step:
[`identity-provider.md`](./identity-provider.md) "To add an organisation"

## Making `tenant` non-null — three ladders

### A. Fastest: a default tenant, no Authentik (single-tenant baseline)

Set a map with just a `defaultTenant` and restart. Every request (even unauthenticated) now resolves
to that tenant, and new rows get stamped with it.

```bash
export TENANT_GROUP_MAP='{"platformAdminGroup":"mediator-admin","tenants":[{"id":"revamp","label":"revamp-it","group":"tenant-revamp"}],"defaultTenant":"revamp"}'
npm start
curl -s localhost:8080/api/whoami | jq
# → { "identity": { "authenticated": false, "username": null, "groups": [],
#                   "tenant": "revamp", "role": null } }
```

This is exactly how the existing revamp-it deployment would run as "tenant #1" before multi-tenant
auth is turned on.

### B. Test real identity locally — still no Authentik (dev only)

With **no proxy in front**, the backend trusts whatever `X-authentik-*` headers arrive, so you can
simulate any user/tenant/role from curl. Use the same map as (A):

```bash
# a normal user of tenant "revamp"
curl -s localhost:8080/api/whoami \
  -H 'X-authentik-username: alice' \
  -H 'X-authentik-groups: tenant-revamp' | jq
# → authenticated:true, username:"alice", tenant:"revamp", role:"normal"

# a tenant admin (super)
curl -s localhost:8080/api/whoami \
  -H 'X-authentik-username: bob' \
  -H 'X-authentik-groups: tenant-revamp|tenant-revamp-admin' | jq
# → role:"super"

# a platform admin
curl -s localhost:8080/api/whoami \
  -H 'X-authentik-username: carol' \
  -H 'X-authentik-groups: mediator-admin' | jq
# → role:"platform-admin"
```

Groups accept `|` (Authentik's default) or `,` as separators. This is the quickest way to watch
stamping work: send a create with these headers, then inspect the row's `TenantId` (below).

> [!WARNING]
> This header-trust is **only safe without a public proxy**. In any deployed setup the proxy MUST
> strip client-supplied `X-authentik-*` and set them solely from the outpost — otherwise anyone can
> spoof identity by sending the header. That stripping is the whole point of the Phase 1b proxy
> config; see the security note in [`docs/setup.md`](../setup.md) "Phase 1b".

### C. Full path: Authentik + forward-auth proxy

The real deployment, via opt-in override files: `docker-compose.authentik.yml` (local nginx, config
[`config/nginx/mediator.authentik.conf`](../../config/nginx/mediator.authentik.conf)) or
`docker-compose.prod.authentik.yaml` (host Traefik, enabled by `AUTHENTIK_ENABLED=true`). Both
switch on `AUTH_REQUIRED`. The step-by-step with checks (outpost `authentik_host`, provider,
groups, spoof test) is in [`identity-provider.md`](./identity-provider.md) "Setup, in order".
Once logged in, `/api/whoami` shows the real user, their tenant, and role.

## What stamping does today

- Create handlers `create-box`, `add-item`, `import-item` call `resolveTenant(ctx)` (=
  `ctx.identity.tenant`, trimmed; `null` when absent) and put it on the new row.
- The item/box **upserts preserve an existing owner** on conflict
  (`TenantId = COALESCE(<table>."TenantId", EXCLUDED."TenantId")`): ownership is set **once** at
  create; an upsert can never reassign a row to another tenant. A legacy `NULL` row gets filled the
  next time its tenant touches it.
- `whoami`'s `tenant` is exactly what a create *would* stamp right now — so it doubles as a
  "what will this become" probe.

Not yet stamped (deferred with Phase 3, where their scoping lands): `box_stubs`, `item_relations`,
`quality_assessments`, and the agentic/bulk/intake create paths.

## What is enforced (Phase 3a: writes)

Rule: `owner(row) = row.TenantId ?? defaultTenant` (`backend/lib/ownership.ts`).

| Requester | May change |
|---|---|
| No login (Basic Auth deployment, the live system) | everything, as before |
| Platform admin | everything |
| Logged in with org X | only rows owned by X; catalogue entries only if contributed by X |
| Logged in without an org | nothing (read-only) |

- **Handlers** answer `403` ("Gehört einer anderen Organisation…") before writing; bulk operations
  are all-or-nothing and list the foreign rows.
- **Safety net:** the item, catalogue-entry and box upserts in `db.ts` only overwrite a row its owner
  may change (checked in SQL). A blocked overwrite logs `[tenancy] Blocked overwrite…`.
- An org can stock items of **another org's catalogue entry**: the item is its own, the entry stays
  untouched (read-only for it).
- Rows created from a parent (spare parts, in-device components, relations, Fundsachen) inherit the
  parent's owner.
- **Joining tenancy later** (e.g. revamp): set `defaultTenant` and all unowned rows belong to that
  org, with no data migration.

## What is enforced (Phase 3b: reads)

Reads stay **shared**: every org sees every item and catalogue entry, which org holds it and how
many. Only an item's private details are hidden from other orgs (same owner rule,
`canSeePrivate` in `ownership.ts`, applied by `backend/lib/redaction.ts`). No login and platform
admins see everything, as before.

| Data | Another org sees |
|---|---|
| Item location (box, shelf, location) | the **owner org's name** instead (`Location`/`ShelfLabel`, `BoxID` empty, `LocationRedacted: true`) |
| Boxes, shelves, Fundsachen | nothing: "not found" (detail, QR scan, lists, search, overview) |
| Item log (history tab), box log, activity feeds | nothing: only events about your own items/boxes |
| Marks on the item | only your own mark |
| AI review "reviewed by" on a catalogue entry | hidden unless your org contributed the entry |
| Search by a box id | finds neither the box nor its items |
| Item export (`/api/export/items`) | only your own items |
| Full export (`/api/export/data`) | refused (403), platform admins only |
| Serial/MAC, intake data, photos, attachments | **visible** (grey zone, decided 2026-10-13) |

Where it happens: the shared reads in `db.ts` (`getItem`, `findByMaterial`, `itemsByBox`,
`listItems*`, `listItemsForExport`, `getBox`, `boxesByLocation`, `listBoxes`, `listRecentBoxes`,
`listStubs`, event queries) plus the handlers with their own SQL (`search`, item relations in
`item-relations` + `save-item`, `user-marks`, exports). New read paths that return `BoxID`,
`Location` or people must go through the same helpers.

## Not enforced yet

- No global stock total yet (DL2).
- The UI still offers write actions on another org's items (they answer 403).

## Inspecting state

```bash
# the seeded registry
psql "$DATABASE_URL" -c 'SELECT * FROM tenants;'

# what got stamped on recent rows
psql "$DATABASE_URL" -c 'SELECT "ItemUUID","Artikel_Nummer","TenantId" FROM items ORDER BY "UpdatedAt" DESC LIMIT 10;'
psql "$DATABASE_URL" -c 'SELECT "BoxID","Label","TenantId" FROM boxes ORDER BY "UpdatedAt" DESC LIMIT 10;'
```

A fresh column on legacy rows reads `NULL` — expected until Phase 3 backfill.

## Open things to settle before Phase 3

From [`docs/PLANNING_TENANCY.md`](../PLANNING_TENANCY.md) §5 — worth deciding while you test:

1. **Default tenant** for legacy/`NULL` rows (the existing revamp-it deployment → tenant #1).
2. **`tenants` registry**: keep the thin local table synced from the map (current), or treat
   Authentik as the sole source?
3. **Where the global aggregate quantity surfaces** (which catalogue/search screens show the
   network-wide total vs. own-tenant stock).
4. ~~**Admin endpoints**~~ **Resolved (#969):** role-gated (`platform-admin`), `ADMIN_SECRET` break-glass from inside the host only. Was: do the `ADMIN_SECRET`-gated `/api/admin/*` routes become role-gated
   (`platform-admin`), with `ADMIN_SECRET` kept only as break-glass?

## Key files

| Concern | File |
|---|---|
| Identity resolver + group map + `configuredTenants` | [`backend/lib/identity.ts`](../../backend/lib/identity.ts) |
| `resolveTenant(ctx)` helper | [`backend/utils/tenant.ts`](../../backend/utils/tenant.ts) |
| `ctx.identity` injection + registry seeding | [`backend/server.ts`](../../backend/server.ts) |
| `whoami` endpoint | [`backend/actions/whoami.ts`](../../backend/actions/whoami.ts) |
| Schema (`tenants`, `TenantId` columns) + upserts | [`backend/db.ts`](../../backend/db.ts) |
| Stamp-on-create | `backend/actions/{create-box,add-item,import-item}.ts` |
| Proxy template + Authentik runbook | [`config/nginx/mediator.authentik.conf`](../../config/nginx/mediator.authentik.conf), [`docs/setup.md`](../setup.md) |
| Config reference | [`.env.example`](../../.env.example) (`TENANT_GROUP_MAP*`) |
