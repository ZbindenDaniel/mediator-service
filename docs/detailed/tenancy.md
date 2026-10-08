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

The **`tenants` DB table** is just a local registry (id, label, active) seeded from this map at
startup (`configuredTenants()` → `upsertTenant`). It's a display/FK target — it does **not** drive
resolution and does **not** enforce anything. Seeding is idempotent and a no-op when the map has no
tenants.

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

The real deployment. Summarised here; the step-by-step (provider, embedded outpost, groups, nginx
swap, Traefik snippet, verification incl. the spoof test) lives in
[`docs/setup.md`](../setup.md) **"Phase 1b — forward-auth wiring"**.

1. In Authentik: create a **Proxy Provider** + application, enable the **embedded outpost**, and
   create the **groups** you referenced in the map (`tenant-revamp`, `tenant-revamp-admin`,
   `mediator-admin`). Assign users to groups.
2. Put the proxy in front of the app using
   [`config/nginx/mediator.authentik.conf.example`](../../config/nginx/mediator.authentik.conf.example)
   (dev/nginx) or the Traefik `forwardAuth` snippet (prod) — both inject the two headers from the
   outpost response **only**, overwriting any client copy.
3. Set `TENANT_GROUP_MAP` to match the group names. Restart.
4. Log in through Authentik and hit `/api/whoami` — it now shows the real user, their tenant, and
   role. Drop nginx Basic Auth once this is verified.

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

## What is NOT enforced yet (Phase 3)

- **No read filtering.** Lists, searches, box/shelf views return rows regardless of `TenantId`.
  A `revamp` user still sees another tenant's warehouse.
- **No write/ownership guard.** Nothing stops editing/deleting another tenant's row.
- **No catalogue vs. logistics split in queries**, no cross-tenant aggregate quantity, no
  platform-admin bypass, no legacy-`NULL` backfill.

All of that is the Phase 3 work, concentrated in the `db.ts` logistics functions so it can't be
bypassed per-handler. It needs the **default-tenant decision** (revamp-it = tenant #1) and is best
verified against a real Postgres.

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
4. **Admin endpoints**: do the `ADMIN_SECRET`-gated `/api/admin/*` routes become role-gated
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
| Proxy template + Authentik runbook | [`config/nginx/mediator.authentik.conf.example`](../../config/nginx/mediator.authentik.conf.example), [`docs/setup.md`](../setup.md) |
| Config reference | [`.env.example`](../../.env.example) (`TENANT_GROUP_MAP*`) |
