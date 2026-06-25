# Changelog: Docs, Config & Infrastructure

Covers: documentation updates, CLAUDE.md/OVERVIEW.md changes, environment configuration, Docker, deployment scripts, DB migrations, cross-cutting refactors.

---

## 854. ✅ Documentation restructure: filesystem-aligned READMEs + topic changelogs
   - **Why:** OVERVIEW.md had grown to 682 lines / 849 entries — too expensive to read at every session start. Restructured: OVERVIEW.md is now a ~70-line navigation hub; 18 folder READMEs (purpose, contents, relations, scope, rules, decisions) live alongside the code; 11 topic changelogs in docs/changelogs/ hold the full history distributed by domain. CLAUDE.md updated to direct new entries to topic changelogs with a one-liner summary in OVERVIEW.md.
   - **Deferred:** docs/changelogs/ entries from main (850–853) added post-rebase. Folder READMEs for leaf folders (agentic/flow/, agentic/prompts/, agentic/tools/) are stubs.

## 852. ✅ Harden nginx headers, dockerignore secrets, restrict Postgres bind address
   - **Why:** (1) Nginx was missing four standard browser security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy) — pure client-side defence-in-depth. Camera kept enabled in Permissions-Policy because the app uses it for QR scanning. (2) `.dockerignore` didn't exclude `.env` or `secrets/` — both are present on real hosts. (3) Postgres `ports: 5432:5432` bound to 0.0.0.0 — changed to `127.0.0.1:5432:5432`.
   - **Deferred:** Remaining audit items (chmod 777 on /run/cups, resource limits, erp-sync credentials, read-only filesystem) tracked in backlog.

## 851. ✅ Harden Docker pipeline: entrypoint fail-fast, clean shutdown, log rotation
   - **Why:** (1) CUPS entrypoint looped silently if the socket never appeared — added fail-fast exit after 15s. (2) Background discovery loop was orphaned on SIGTERM — now tracked via DISCOVERY_PID and killed in the trap. (3) All containers had no log size limit — added 10 MB × 3 file cap in both compose files.
   - **Deferred:** chmod 777 on /run/cups left unchanged — tightening requires aligning UIDs/GIDs across images.
