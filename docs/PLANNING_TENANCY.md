# Planning: Multi-Tenancy

**Status:** Phased implementation plan (no code yet)
**Parent (conceptual design):** [`docs/PLANNING_NEW_USE_CASE.md`](PLANNING_NEW_USE_CASE.md) §10.1 + §12.3
**Goal:** Let multiple organisations, each with multiple users, work in one hosted
deployment — a **shared spare-part catalogue** everyone benefits from, while each
org's **logistics (warehouse/shelves/stock) stays private**.

---

## 1. Why this order — identity before `tenant_id`

The branch exists for tenancy, so this is the right workstream. But it has a hard
prerequisite that shapes the phasing:

**Confirmed current state (greenfield):**
- The backend does **not** know who is making a request. Auth is a shared secret
  (`ADMIN_SECRET` bearer for `/api/admin/*`, `INTAKE_TOKEN` for intake) plus a
  **free-text "actor"** name typed in the browser. No per-user identity.
- **No** `tenant` / `mandant` / `org_id` anywhere in the schema or queries.
- Authentik was **stood up** in the compose stack (#898) but **nothing consumes
  it** — no forward-auth in `config/nginx/mediator.conf` (dev) or
  `docker-compose.prod.yaml` (Traefik, prod), and the backend reads no identity
  headers.
- The per-request context object is built at the dispatch chokepoint
  (`backend/server.ts:1027`, `action.handle(req, res, { … })`) — **the single
  place to inject resolved identity**.

You cannot scope data per tenant until the request carries an identity. So
**Phase 1 is identity**, and it is independently valuable: "multiple users working
together" needs real logins + audit regardless of tenancy.

---

## 2. Design recap (settled in the parent plan)

- **Two-tier visibility on the reference↔instance seam:**
  - **Shared catalogue** — `item_refs` (part descriptions/specs), `item_ref_relations`,
    ref-level `agentic_runs`: **no `TenantId`**, read by all; writes guarded by an
    optional `ContributedByTenant`.
  - **Private logistics** — `items` (physical instances), `boxes` + shelves,
    `box_stubs`, `item_relations`, per-instance `quality_assessments`, logistics
    `events`: carry **`TenantId`**, hard-isolated (reads *and* writes filtered).
- **Tenants + groups managed in Authentik**; the app stores a tenant reference and
  resolves identity from forward-auth headers.
- **Roles:** `normal` (contribute + own logistics), `super` (tenant admin: creates
  the tenant's shelves, manages its users), `platform-admin` (users of a designated
  **admin tenant** — cross-tenant, hosting ops).
- **Resolved decisions (DL1–DL3):** keep global-unique minted `BoxID`/shelf IDs
  (add `TenantId` as a *visibility* column, not part of the key); catalogue exposes
  **global aggregate quantity** but private locations; QR/scan self-resolves via the
  globally-unique id. Self-registration via org token = Authentik enrollment only,
  no data-model impact. Taxonomy/contracts stay **deployment-wide** (not per-tenant).

---

## 3. Phases

### Phase 1 — Identity into the backend (prerequisite; independently valuable)  ✅ CODE DONE (proxy needs host verification)

**Shipped:** (1a) `backend/lib/identity.ts` resolves `X-authentik-*` headers → `{ authenticated,
username, groups, tenant, role }` via a config-driven `group→{tenant,role}` map
(`TENANT_GROUP_MAP`/`_FILE`); injected into the per-request `ctx` at the dispatch chokepoint;
behaviour-neutral (nothing gates on it yet), `ADMIN_SECRET` stays break-glass. (1c) `resolveActor(ctx,
requestActor)` prefers the authenticated username for the event-log `Actor`, applied to the item/box
lifecycle write handlers (falls back to the typed actor until forward-auth is live). (1b) proxy
config is **templated, not active**: `config/nginx/mediator.authentik.conf.example` + a Traefik
snippet + Authentik provider/outpost/group runbook in `docs/setup.md` "Phase 1b", with the
spoof-protection (headers set only from the outpost) called out — **needs on-host verification before
Basic Auth is dropped.** Tests: identity resolver + actor helper. **Follow-up:** adopt `resolveActor`
in the remaining actor-bearing handlers (agentic/bulk/export/print/catalog/qr-scan).

#### Original plan

- **Proxy forward-auth:** nginx `auth_request` against the Authentik outpost in
  `config/nginx/mediator.conf` (dev); Traefik `forwardAuth` middleware in
  `docker-compose.prod.yaml` (prod) — and add the Authentik services to the prod
  compose (only dev has them today). Drop nginx Basic Auth once forward-auth works.
- **Backend identity resolver:** a helper (generalising `backend/utils/admin-auth.ts`)
  that reads `X-authentik-username` / `X-authentik-groups` and resolves
  `{ username, groups, tenant, role }` via a **config-driven `group → {tenant, role}`
  map** (not a hardcoded binary — extra tenants/roles are config lines). Inject the
  result into the per-request `ctx` at `server.ts:1027`. Keep `ADMIN_SECRET` as a
  **break-glass** fallback.
- **Audit:** populate the free-text `Actor`/`Username` fields from the authenticated
  user.
- **Authentik config:** Proxy Provider + embedded outpost; groups (`mediator-admin`
  for the admin tenant + one group per tenant); everyone-else = authenticated user.
- **Acceptance:** every request carries `{ user, tenant, role }`; the event log shows
  real users. **No data scoping yet** — behaviour unchanged.

### Phase 2 — Additive tenant schema (behaviour-neutral)
- Add **nullable `TenantId`** to the logistics tables (`items`, `boxes`, `box_stubs`,
  `item_relations`, `quality_assessments`, and logistics `events`) — additive
  `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, same pattern as recent migrations.
- Add an optional `ContributedByTenant` to `item_refs` (attribution; reads stay global).
- A small **`tenants`** table (id, label, active) as the local registry / FK target and
  for display — populated from Authentik groups (synced or admin-managed). *(Decision
  T1 below: local registry vs. bare id string.)*
- **Stamp `TenantId` on create** from `ctx.tenant` (writes only) — but **no read
  filtering yet**; legacy `NULL` rows stay readable. Behaviour-neutral.
- **Acceptance:** schema in place, new logistics rows carry their tenant, nothing is
  filtered or hidden yet.

### Phase 3 — Class-aware scoping (the enforcement)
- **Logistics:** reads *and* writes filtered by `ctx.tenant` with **no shared
  fallback**, enforced in the `db.ts` logistics functions (not per handler) so it
  can't be bypassed. Destructive ops assert ownership.
- **Catalogue:** reads stay global; writes/deletes guarded by `ContributedByTenant`
  (+ platform-admin override).
- **Cross-tenant aggregate quantity (DL2):** a controlled `SUM(items) GROUP BY
  Artikel_Nummer` for the catalogue view — total only, never tenant/location rows.
- **Platform-admin bypass:** the admin tenant sees across tenants (support).
- **Backfill:** assign legacy `NULL` logistics rows to a configured default tenant.
- **Acceptance:** a tenant sees only its own warehouse; the catalogue (incl. global
  stock totals) is shared; a platform admin sees everything.

### Phase 4 — Tenant/user admin + onboarding
- **Role gating:** `super` creates its tenant's shelves + manages its users;
  `platform-admin` manages tenants. Reuses the identity plumbing (and the same
  gate mechanism a later feature-flag system would use).
- **Self-registration via org token** — an Authentik enrollment flow that files a new
  account under the right tenant group. No app data-model impact (per the parent
  decision); only provisioning policy (who issues tokens, expiry, admin-tenant
  bootstrap).
- **Tenant management UI** (platform admin): list/activate tenants; per-tenant user
  overview. Minimal first.
- **Acceptance:** tenant admins run their warehouse; platform admins manage tenants;
  users self-register into the correct tenant.

---

## 4. Risk & effort

- **Largest workstream on the branch.** Phase 1 is **infra-heavy** (proxy +
  Authentik config) but the backend change is small (header resolver + ctx
  injection). Phase 3 is the **invasive** one — it touches every logistics query;
  concentrating scoping in the `db.ts` layer is what keeps it tractable and safe.
- **De-risked by phasing:** Phases 1–2 are behaviour-neutral (identity + additive
  schema), so they can land and bake before Phase 3 flips isolation on.
- **Blast radius:** Phase 3 changes what data users see — needs careful tests
  (a tenant cannot read another's logistics; catalogue stays shared; platform-admin
  bypass) before enabling in production.

---

## 5. Open decisions (need your input before/within the phases)

1. **Auth mechanism — RESOLVED: forward-auth + Authentik as broker.** The proxy
   authenticates and injects `X-authentik-*` headers; the app reads them (smallest
   change for the frameworkless backend). Authentik is both the IdP (its own users,
   to start) *and* an abstraction layer: LDAP, Nextcloud-shared-users, and SSO are
   later **Authentik sources**, with **zero app change** (the app's contract stays
   `headers → ctx`). **Security-critical:** the proxy MUST strip any client-supplied
   `X-authentik-*` headers so only the outpost can set them (else identity spoofing).
2. **T1 — `tenants` table:** keep a small local registry (id, label) synced from
   Authentik for display/FK, or store only the tenant id string and treat Authentik
   as the sole source? (Lean: a thin local registry.)
3. **Default tenant** for legacy/`NULL` logistics rows at backfill (the existing
   revamp-it deployment becomes tenant #1).
4. **Where global aggregate quantity surfaces** (catalogue/search views) — which
   screens show the network-wide total.
5. **Admin endpoints:** do the current `ADMIN_SECRET`-gated `/api/admin/*` routes
   become **role-gated** (`platform-admin`), with `ADMIN_SECRET` kept only as
   break-glass? (Lean: yes.)

---

## 6. Relationship to the rest of the plan

- **Depends on nothing already built** except that it *reuses* the runtime-config
  patterns (e.g. `ctx` injection) established by the taxonomy work.
- **Feature-flag system** is deferred and independent; its role-gating will reuse
  Phase 1's identity + `group → role` map, so doing tenancy first is not wasted.
- **Taxonomy/contracts** are deployment-wide, so tenancy does not touch them.
