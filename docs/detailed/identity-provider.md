# Identity provider (Authentik) — crash course

> [!NOTE]
> This is the **plain-language introduction**. Once the concepts make sense, use:
> - [`tenancy.md`](./tenancy.md) — the operator runbook: exact resolution rules, how to test, how to inspect data
> - [`docs/setup.md`](../setup.md) "Authentik" + "Phase 1b" — the click-by-click wiring
> - [`docs/PLANNING_TENANCY.md`](../PLANNING_TENANCY.md) — the phase plan

## The one-paragraph version

Today the app is protected by a single shared nginx password (Basic Auth). It can't tell
people apart. **Authentik** is a separate program that manages **real user accounts** and
**groups**. We put it in front of the app, like a doorman. Every request has to get past the
doorman first. If you're not logged in, you get sent to Authentik's login page. Once you're
logged in, the doorman adds a name tag to each request before passing it on: *"this is alice,
she's in group tenant-revamp"*. The app reads the name tag and works out **which organisation
(tenant)** you belong to and **what role** you have. The app never sees passwords and never runs
its own login.

## The cast

| Piece | What it is, simply | Where it lives |
|---|---|---|
| **Authentik** | The user database and login screen. You create users and groups here. | `authentik-server` + `authentik-worker` containers, with their own Postgres + Redis (`docker-compose.yml`) |
| **Outpost** | The part of Authentik that answers the doorman's question *"is this person logged in, and who are they?"* We use the **embedded** outpost, which is built into `authentik-server`, so there's nothing extra to run. | `http://authentik-server:9000/outpost.goauthentik.io/…` |
| **Proxy Provider** | A setting inside Authentik that says *"protect this app using forward-auth"*. Without it the outpost doesn't know our app exists. | Configured in the Authentik admin UI |
| **Reverse proxy** (nginx in dev, Traefik in prod) | The doorman. Before passing each request to the app, it asks the outpost about it, then adds the name-tag headers. | [`config/nginx/mediator.authentik.conf`](../../config/nginx/mediator.authentik.conf), [`docker-compose.prod.authentik.yaml`](../../docker-compose.prod.authentik.yaml) |
| **The app (backend)** | Reads the name tag and turns it into `{ user, tenant, role }` | [`backend/lib/identity.ts`](../../backend/lib/identity.ts) |
| **Organisationen page** | Organisations, their sites, and which Authentik group belongs to each | *Administration → Organisationen verwalten* (seeded from `TENANT_GROUP_MAP`) |

## What happens on one request

```
 Browser                nginx / Traefik              Authentik outpost            Mediator backend
    │   GET /items           │                              │                              │
    │───────────────────────▶│  "is this cookie logged in?" │                              │
    │                        │─────────────────────────────▶│                              │
    │                        │                              │                              │
    │      ┌─ NOT logged in: 401 ──────────────────────────│                              │
    │◀─────┘  redirect to Authentik login page             │                              │
    │   (user logs in, gets a cookie, browser retries)       │                              │
    │                        │                              │                              │
    │                        │◀── 200 + X-authentik-username: alice                         │
    │                        │          X-authentik-groups: tenant-revamp                   │
    │                        │                              │                              │
    │                        │  forward request WITH those two headers (client copies       │
    │                        │  are overwritten)                                            │
    │                        │─────────────────────────────────────────────────────────────▶│
    │                        │                              │   resolveIdentity(headers)    │
    │                        │                              │   → { username: alice,        │
    │                        │                              │       tenant: revamp,         │
    │                        │                              │       role: normal }          │
    │◀───────────────────────│◀─────────────────────────────────────────────────────────────│
```

This setup is called **forward-auth**: the proxy forwards the "who is this?" question to
Authentik before letting the request through.

## Users, groups, tenants, roles

Authentik only knows about **users** and **groups**. *Organisation* (tenant) and *role* are ideas
that exist only in our app. Each organisation in the app is **linked to an Authentik group by its
name**:

| You put a user in this Authentik group… | …and the app treats them as |
|---|---|
| `tenant-revamp` | tenant `revamp`, role **normal** (an ordinary worker) |
| `tenant-revamp-admin` (the tenant's `superGroup`) | tenant `revamp`, role **super** (the tenant's admin) |
| `mediator-admin` (the `platformAdminGroup`) | role **platform-admin** (looks after every tenant) |
| none of the above | the `defaultTenant` from the map, if one is set |

**To add an organisation:**

1. In Authentik, create a group (e.g. `tenant-zurichrepair`) and put the org's users in it.
2. In the app, go to *Administration → Organisationen verwalten*. Create the org (ID, name) and
   enter that group name. Optionally add a contact email (for orders) and its sites (warehouse
   locations with floors).

It's live immediately, with no restart. The org's users get their org on their next request.

**What lives where:**

- **Authentik:** users, passwords, group membership.
- **App (Organisationen page):** the org, its name, contact, sites, and which Authentik group
  belongs to it.
- **`.env`:** only the platform-admin group (`platformAdminGroup`, kept out of the UI so you can't
  lock yourself out) and the `defaultTenant` for requests without a login.

`TENANT_GROUP_MAP` in `.env` is now only the **starting point**: on first start its orgs are copied
into the app, and later edits in the page win. The full map still works on its own for a deployment
without the page, e.g. a fresh local test:

```bash
TENANT_GROUP_MAP='{"platformAdminGroup":"mediator-admin","tenants":[{"id":"revamp","label":"revamp-it","group":"tenant-revamp","superGroup":"tenant-revamp-admin"}],"defaultTenant":"revamp"}'
```

## Setup, in order

Each step ends with a check (✔). Don't start a step until the previous check passes. Do the local
run first: it's the same setup with the same clicks, minus DNS and certificates.

### Part A — try it locally (nginx)

1. **Configure.** In `.env`, set `AUTHENTIK_SECRET_KEY` (`openssl rand -base64 60`),
   `AUTHENTIK_PG_PASSWORD`, `AUTHENTIK_BOOTSTRAP_PASSWORD`, `TENANT_GROUP_MAP` (as above), and
   `INTAKE_TOKEN` if you use the intake station.
   Pick the final `AUTHENTIK_PG_PASSWORD` now. Changing it later needs an extra step (see
   *When something's off*).
2. **Start with the Authentik override:**
   `docker compose -f docker-compose.yml -f docker-compose.authentik.yml up -d --build`
   ✔ `docker compose ps` shows everything healthy. Authentik takes 1–2 minutes, and nginx waits
   for it.
3. **Log in to Authentik** at `http://localhost:9000/if/admin/` as `akadmin`, using the bootstrap
   password.
4. **Tell the outpost where the login page is.** Go to *Applications → Outposts → authentik
   Embedded Outpost → edit*, and under *Advanced settings* set
   `authentik_host: http://localhost:9000/`.
5. **Create the Proxy Provider.** Go to *Applications → Providers → Create → Proxy Provider* and:
   - set the mode to **Forward auth (single application)**
   - set *External host* to `https://localhost`
   - leave the authorization flow at its default

   Then go to *Applications → Create* (name it `mediator`) and link the provider. Finally, edit the
   **embedded outpost** again and add the `mediator` application to it.
6. **Create groups and users.** Create the groups `mediator-admin` and `tenant-revamp` (and
   optionally `tenant-revamp-admin`). Create a user, set a password, and add them to
   `tenant-revamp`.
7. **Log in to the app.** Open `https://localhost` in a private window and accept the self-signed
   certificate.
   ✔ You're redirected to the Authentik login page. After logging in, you land in the app.
8. **Check who the app thinks you are:** open `https://localhost/api/whoami`.
   ✔ It shows your username, `"tenant": "revamp"` and `"role": "normal"`.
9. **Spoof test:** run `curl -sk -H 'X-authentik-username: attacker' https://localhost/api/whoami`.
   ✔ You get a redirect to the login page, never `attacker`.
10. **Direct-access test:** run `docker exec mediator curl -s localhost:8080/api/whoami`.
    ✔ `401 Unauthorized`. That's `AUTH_REQUIRED` refusing a request that didn't come through the
    login.

To go back to Basic Auth, start without the override file:
`docker compose up -d`.

### Part B — put it in the cloud (host Traefik)

Same clicks as Part A, but with real domains and HTTPS. The prod setup lives in
[`docker-compose.prod.authentik.yaml`](../../docker-compose.prod.authentik.yaml), an opt-in
addition to `docker-compose.prod.yaml`.

1. **DNS:** point two names at the VM, one for the app and one for the login page (for example
   `erfassung.example.org` and `auth.example.org`). Without them, the defaults are
   `erfassung.<VM_IP>.nip.io` and `auth.<VM_IP>.nip.io`.
2. **Host `.env`:** everything from Part A step 1, plus:
   ```bash
   AUTHENTIK_ENABLED=true                 # the deploy workflow adds the Authentik override from now on
   MEDIATOR_DOMAIN=erfassung.example.org
   AUTHENTIK_DOMAIN=auth.example.org
   ADMIN_SECRET=<long random>            # emergency key, only usable from inside the server
   INTAKE_TOKEN=<long random>            # required: intake requests are rejected without it
   ```
   Use strong values for `AUTHENTIK_PG_PASSWORD` and `AUTHENTIK_BOOTSTRAP_PASSWORD`. Unlike
   locally, these are protecting something real.
3. **Start:**
   `docker compose -f docker-compose.prod.yaml -f docker-compose.prod.authentik.yaml up -d`
   ✔ `https://auth.example.org/if/admin/` shows the Authentik login.
4. **Repeat Part A steps 3–6**, with two differences:
   - the outpost's `authentik_host` is `https://auth.example.org/`
   - the provider's *External host* is `https://erfassung.example.org`
5. **Repeat the checks from Part A steps 7–9** against `https://erfassung.example.org`.
6. **Change the `akadmin` password** in Authentik. Better still, create your own admin user, put
   it in Authentik's `authentik Admins` group, and deactivate `akadmin`.

## The one security rule

The app **trusts the name-tag headers completely**. That's safe only if users can never set those
headers themselves, and three things guarantee it:

- **nginx** sets the headers only from the outpost's answer. On the one machine route
  (`/api/intake/`), which skips the login, it blanks them.
- **Traefik** first deletes any client copies (the `ak-strip` middleware), then runs the login
  check (`ak-auth`). The order matters: Traefik only overwrites headers the outpost actually
  returns.
- **The app** (`AUTH_REQUIRED=true`) refuses data requests that arrive with no identity at all,
  in case something ever reaches port 8080 directly.

Never publish the backend's port 8080, and never "simplify" those header lines away. If you do,
anyone can claim to be anyone with a single curl command.

## Admin access and user info

- **Admin panel:** members of the `mediator-admin` group (role *platform-admin*) see the
  *Administration* link and get straight in. Everyone else doesn't see the link, and calling an
  admin API returns *403 Forbidden*.
- **Emergency key (`ADMIN_SECRET`):** with Authentik on, `/api/admin/` goes through the login like
  everything else, so the password alone gets nobody in from outside. If Authentik is down, use it
  from the server itself:
  ```bash
  docker exec mediator curl -s -H "Authorization: Bearer $ADMIN_SECRET" localhost:8080/api/admin/config
  ```
- **Who did what:** when logged in, the app records the login name for every action (event log,
  prints, reviews, stubs, marks). Names typed into the browser are ignored. Double-click the name
  in the top-right corner to see your account, organisation and role, and to log out.
- **Without Authentik** (Basic Auth): unchanged. The name is typed in, and the admin page asks for
  the password.

## What it does — and doesn't do — yet

| Works today | Not yet (later phases) |
|---|---|
| Every request gets an identity (`/api/whoami` shows it) | Users **still see every tenant's data**. Nothing is filtered by tenant (Phase 3). |
| Every action is recorded under the real login name | Nobody is blocked from editing another tenant's items (Phase 3) |
| Admin panel by role (`mediator-admin`) | Tenant admins (*super*) have no extra powers yet; what they may do is still to be defined |
| New items and boxes are stamped with the creator's `TenantId` | Tenant/user management inside the app (Phase 4) |

So for now, logging in tells the app **who you are** and whether you're an admin, but doesn't yet
limit **which items you can see**.

## When something's off

| Symptom | Likely cause |
|---|---|
| `whoami` → `authenticated: false` behind the proxy | The proxy isn't forwarding the headers. Check the `auth_request_set` / `proxy_set_header` lines (nginx) or `authResponseHeaders` (Traefik). |
| `authenticated: true` but `tenant: null` | None of the user's groups is in the map, and there's no `defaultTenant`. Group names must match **exactly**. |
| `role: null` | The user is logged in, but no tenant was resolved (see the row above) |
| You're always redirected to the login page, even after logging in | *External host* in the Proxy Provider doesn't match the URL in the browser, so the cookie is set for the wrong domain |
| nginx 500 on every page | nginx can't reach `authentik-server:9000`. Is the container up and on the same Docker network? It also happens for about a minute after Authentik restarts. |
| `authentik-server` never gets healthy; its log says `password authentication failed for user "authentik"` | `AUTHENTIK_PG_PASSWORD` was changed in `.env` after the first start. Postgres only takes the password when it creates its data. Fix without losing your Authentik setup: `docker exec authentik-postgresql sh -c 'printf "%s\n" "ALTER USER CURRENT_USER PASSWORD :'"'"'pw'"'"';" \| psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v pw="$POSTGRES_PASSWORD"'`, then `docker restart authentik-server authentik-worker` |
| After logging in at Authentik you're bounced to `localhost:9000` or a wrong host | The embedded outpost's `authentik_host` isn't set to the browser-reachable login URL |
| `401 Unauthorized` (JSON) instead of a login redirect | The request reached the app without passing the proxy login. Check that you're using the proxy URL, and in prod that `AUTHENTIK_ENABLED=true` is in the host `.env` |
| The intake station gets 401 | `INTAKE_TOKEN` isn't set on the server, or the station sends a different one |
| An admin sees "Kein Zugriff" on the admin page | Their Authentik user isn't in the `platformAdminGroup` (default `mediator-admin`) |
| A logged-in user has `tenant: null` | Their group isn't linked to any **active** org on the Organisationen page (names must match exactly), and there's no `defaultTenant` |
| My old marks are gone after switching to Authentik | Marks are stored per username. Old ones are under the name typed before; rename them in `user_item_marks` if the login name differs |
| You changed the map and nothing happened | The map is read once and cached. Restart the app. |
