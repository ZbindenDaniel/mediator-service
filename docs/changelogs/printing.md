# Changelog: Printing

Covers: label printing, CUPS integration, printer queue management, print templates, driver setup, print job dispatch.

---

## 1084. ✅ Browser printing verified on the Raspi; nginx routes every queue by regex
**Why:** First real label printed through browser → nginx (TLS, origin map, basic auth) → CUPS. The production config only allowed one exact queue (`location = /printers/Brother_QL560_klein`), so any other label-type queue got a 404 preflight and showed as `printer_unreachable`. The reference config now uses `location ~ ^/printers/[A-Za-z0-9_.-]+$`: all queues, no sub-paths (CUPS admin/jobs and traversal stay closed), and port 443 like the deployed proxy. Lessons from the rollout: the queue names in Drucker-Einstellungen must match `lpstat -p` on the Raspi, and the proxy user/password must be set or nginx answers 401.
**Deferred:** nothing deferred.

## 1083. ✅ Print proxy CA certificate downloadable from the mediator
**Why:** Every workstation must trust the Raspi proxy's own CA, and copying `ca.crt` off the Raspi per machine is tedious. Admins paste the CA once into Drucker-Einstellungen (`printer.browser_ca_pem`); `GET /api/print/proxy-ca.crt` serves it as `application/x-x509-ca-cert` (Windows/Android offer "install" directly). The print button links it next to "Druckserver nicht erreichbar", the most common first-time failure. Validation rejects anything containing `PRIVATE KEY`, since the value is served to every user.
**Deferred:** Removing the import step entirely needs a publicly trusted certificate (DNS name → 192.168.10.183, Let's Encrypt via DNS-01 on the Raspi) — tracked in todo.md 36b(d).

## 1082. ✅ Browser print proxy: basic auth + TLS/origin-map reference config
**Why:** The Raspi nginx now uses TLS with an own CA (`/etc/nginx/print-tls/ca.crt`), an origin allowlist map (`/etc/nginx/conf.d/print-origins.conf`) and basic auth (`/etc/nginx/print-users`). A cross-origin `fetch` can't rely on the browser's auth prompt, so the credentials live in new settings `printer.browser_user` / `printer.browser_password` (env `PRINTER_BROWSER_USER` / `PRINTER_BROWSER_PASSWORD`); the backend sends a ready `Authorization` header in the browser-dispatch response and `browserPrint` adds it. The password is write-only in Drucker-Einstellungen (GET returns a mask; saving the mask keeps the stored value). 401/403 → `printer_auth_failed`, not retried. `cups/nginx-print-proxy.conf` now shows the matching layout: preflight answered before `auth_basic` (rewrite phase precedes access phase), `Authorization` in `Access-Control-Allow-Headers`, CORS headers `always` so 401s are readable, proxy auth stripped before CUPS. With TLS and a trusted CA, Firefox/Safari work too (no mixed content).
**Deferred:** The credentials reach every logged-in browser — they keep other LAN devices out, not app users. Per-user credentials or short-lived tokens (nginx `auth_request` against the backend) were not built.

## 1081. ✅ Fix label PDF rendering as www-data + accept a bare host:port as print proxy URL
**Why:** First browser-mode test returned `reason: render_exit_1`. The runtime image runs as `www-data` (uid 33) whose HOME `/var/www` doesn't exist, and headless Chromium exits 1 with "Failed to create headless user data directory" (reproduced). `renderHtmlToPdf` now spawns the renderer with `HOME`/`XDG_*` pointing at `<tmpdir>/mediator-renderer-home`. This affected the server (`lp`) path too, which renders through the same function. Also: a proxy URL entered as `192.168.10.183:8765` would have been fetched as a path relative to the app, so `normalizeBrowserUrl` prepends `http://` and the settings validation accepts it.
**Deferred:** nothing deferred.

## 1080. ✅ Browser print mode: frontend sends IPP jobs to the LAN print server via an nginx CORS proxy
**Why:** The backend moved to the cloud and can no longer reach the Raspi CUPS on the LAN. New setting `printer.mode` (`server` | `browser`, env `PRINTER_MODE`) + `printer.browser_url` (env `PRINTER_BROWSER_URL`). In browser mode `print-unified` still renders the label and resolves the queue, then renders the PDF and returns `{ dispatch: 'browser', pdfUrl, printer: { url, queue }, jobName }` instead of running `lp`. `requestPrintLabel` (used by the print button and both auto-print flows) fetches the PDF and posts an IPP Print-Job (`frontend/src/utils/ipp.ts`, hand-rolled because npm IPP clients need Node's http/Buffer) to `<browser_url>/printers/<queue>` with `targetAddressSpace: 'local'` (Chrome Local Network Access exempts it from mixed-content blocking after a one-time prompt), then reports the outcome to `POST /api/print/result` so `PrintFailed` is still logged. Talking to CUPS directly from the browser is impossible: CUPS never answers CORS preflights and has no setting for it, so `cups/nginx-print-proxy.conf` puts a 30-line nginx proxy on the print server (only `/printers/` exposed, Host rewritten to localhost, CUPS config untouched). Rejected: tunnel/VPN to the cloud (new infrastructure) and a polling print agent (~8 days).
**Deferred:** (1) Background `label_queue` jobs (importer auto-labels) are not claimed in browser mode — no browser to send them; they stay Queued until the mode switches back or an agent exists. (2) `/api/printer/status` and the admin CUPS queue tools still use `lpstat`/`lpadmin` from the backend; a browser-side probe (`probeBrowserPrinter`) exists but is not wired into the status card. (3) No per-device printer override in localStorage — one print server is enough for now. (4) Only Chrome/Edge implement the Local Network Access exemption; Firefox/Safari block the request as mixed content unless the proxy gets a trusted HTTPS certificate.

## 860. ✅ Add 62x29 label template with QR code and instance UUID
**Why:** The small label type needed a compact QR+UUID layout similar to existing print templates, so operators can scan instance labels and uniquely identify each instance. Reused the same inline payload / sessionStorage rendering pattern and added a canvas fallback for QR module payloads to keep the template resilient across delivery methods.
**Deferred:** No additional label sizes or backend print-job wiring; this change only updates the 62x29 web template.

## 859. ✅ Atomic label-queue claim (FOR UPDATE SKIP LOCKED) — enables cross-instance printing
**Why:** `nextLabelJob()` issued an unlocked SELECT; with multiple instances each polling every 750 ms, two workers could claim the same row and print the same label twice. Replaced with `claimNextLabelJob()` — an atomic UPDATE…RETURNING with a subquery using `FOR UPDATE SKIP LOCKED`, which transitions the row to `Processing` in the same statement. Added `recoverStaleLabelJobs()` to reset Processing rows older than 5 minutes back to Queued (crash recovery). Added `ClaimedAt` TEXT column to `label_queue` (via `ALTER TABLE … ADD COLUMN IF NOT EXISTS`). Side-effect: all instances share one label queue through Postgres, so a print request from any instance is fulfilled by whichever worker is free — printing to that instance's local CUPS printer. Admin endpoint (`/api/admin/label-queue`) now also reports `processing` count.
**Deferred:** Explicit printer routing (a `TargetPrinter` column to direct a job to a specific named printer) — implicit routing via whichever instance claims the job is sufficient for now. Unit test for double-claim prevention requires a live Postgres DB.
   - **Why:** (1) CUPS crashes on hosts with high/unlimited fd limits — added `ulimits.nofile: 65000/65000` to the cups service in both compose files; CUPS internal calculations assume lower limits and produce an invalid value when the limit is too high, causing EFAULT. (2) www-data (uid 33) in the mediator container gets "Forbidden" from `lpinfo` via the Unix socket — `AuthType None` in cupsd.conf disables credential prompts but CUPS still enforces lpadmin group membership at the socket level; fixed by adding `www-data` to `lpadmin` in `cups/Dockerfile`. USB device passthrough was already handled by docker-compose.usb.yml.
   - **Deferred:** Nothing.

## 850. ✅ Fix OCI runtime exec failure when installing Brother QL driver .debs in Docker
   - **Why:** Brother LPR `.deb` postinst scripts call `systemctl restart cups` after installation. Docker build containers have no systemd, so `dpkg -i` failed with "exec: systemctl: executable file not found". Fixed by stubbing `/usr/local/sbin/systemctl` with a no-op before `dpkg -i` in `cups/Dockerfile`.
   - **Deferred:** Nothing.
## 829. ✅ Make Erkennen trigger a real-time lpinfo scan instead of reading stale cache
   - **Why:** The cups entrypoint refreshed devices.txt/ppds.txt only every 60s. Clicking "Erkennen" right after connecting a USB printer or rebuilding the container returned stale data. Fixed by: (1) entrypoint now polls every 2s for a `/run/cups/refresh-now` signal file and runs lpinfo immediately when found; (2) `cupsRefreshDiscovery()` writes the signal and polls the timestamp file until the scan completes (≤ ~3s); (3) cups-devices/cups-ppds endpoints call this before returning; (4) UI shows scan timestamp and button label changed to "Scannen".
   - **Deferred:** Nothing.

## 828. ✅ Add printer-driver-ptouch to cups Dockerfile for QL-500/550/560/570/580/700 support
   - **Why:** The existing Raspi uses `Foomatic/ptouch-ql` (open-source, from `printer-driver-ptouch` Debian package) rather than the proprietary Brother `.deb`. No binary packages needed; covers the QL-560 and the whole QL-5xx/7xx range. Confirmed from the Raspi CUPS config: `Driver: Brother QL-550 Foomatic/ptouch-ql (recommended)`.
   - **Deferred:** Models not covered by ptouch-ql (e.g. QL-800/810/1050/1100) still need the proprietary `.deb` in `cups/drivers/`.

## 827. ✅ Warn explicitly when a raw queue (no PPD model) will silently discard QL print jobs
   - **Why:** `lp` always returns success when the job is accepted by the spooler. A raw queue sends raw PDF to the QL printer which discards it — CUPS marks the job done and nothing prints. Added log warning in sync-printer-queues.ts, ⚠ raw badge in queue table, and inline warning in PPD field when empty. Also added it to the Einrichtungshilfe as the most common failure mode.
   - **Deferred:** Actual driver fix requires user to place `.deb` files in `cups/drivers/` and rebuild, or set `printer.server` to the Raspi in Admin → Drucker-Einstellungen.

## 826. ✅ Add "Cancel Jobs" button per queue to clear stuck print jobs
   - **Why:** A print job (QL-1050-1) was stuck in CUPS state "now printing … Send data failed", blocking further jobs. Added `cupsCancel(queue)` to cups-client.ts (runs `cancel -a <queue>`), wired it to `POST /api/admin/cups-cancel-jobs` (already plumbed), and added a "✕ Jobs" button per row in the Drucker-Queues table.
   - **Deferred:** Nothing.

## 825. ✅ Add "Neu synchronisieren" button to Drucker-Queues card
   - **Why:** After a cups container rebuild or fixing a lpadmin error, the queue sync runs on a 2-minute interval. An explicit trigger makes the fix-and-verify loop immediate without waiting or restarting the mediator.
   - **Deferred:** Nothing.

## 824. ✅ Add CUPS diagnostics panel to admin UI
   - **Why:** Print jobs appear to succeed in mediator logs but nothing prints, and there are no accessible CUPS logs in the browser. Added `GET /api/admin/cups-diagnostics` endpoint (lpstat -p -l, lpstat -v, lpstat -o, USB cache) and a collapsible «CUPS-Diagnose» section in the Drucker-Queues card with an Aktualisieren button.
   - **Deferred:** Nothing.

## 823. ✅ Fix lpadmin Forbidden + printer_not_ready: cupsd Policy block + empty ppd_model guard
   - **Why:** CUPS has two auth layers — `<Location>` (network/IP) and `<Policy>` (operation/user). `AuthType None` on `/admin` fixed the first; the default `<Policy default>` still required `@SYSTEM` for printer management, causing 403 Forbidden from www-data even via socket. Added `<Policy default><Limit All> AuthType None</Limit></Policy>` to cupsd.conf. Also fixed sync-printer-queues.ts passing `-m ''` when ppd_model is empty, which causes a separate lpadmin error.
   - **Deferred:** Brother QL-1050 still needs its .deb driver in cups/drivers/ + rebuild for the PPD model to be valid. Without it, lpadmin succeeds but the queue prints nothing (no raster filter). Alternative: set printer.server to the Raspi in Admin → Drucker-Einstellungen.

## 822. ✅ Fix lpinfo "Bad Request" (CUPS 2.4): file-based device/PPD discovery
   - **Why:** CUPS 2.4 removed `CUPS-Get-Devices` and `CUPS-Get-PPDs` IPP operations entirely — `lpinfo` from the mediator container fails with "Bad Request" even via Unix socket because the operation no longer exists in the server. `lpinfo` inside the cups container works because it runs backends directly as root. Fix: cups entrypoint writes `devices.txt` and `ppds.txt` to the shared `/run/cups/` volume at startup and refreshes every 60 s; `cups-client.ts` reads those files for `-v`/`-m` queries. IPP fallback kept for remote CUPS ≤ 2.3 servers. Raised CUPS log level to `info`.
   - **Deferred:** Device list is at most 60 s stale. Remote CUPS 2.4 servers cannot do device/PPD discovery (CUPS 2.4 limitation).

## 821. ✅ Fix lpinfo "Bad Request": switch Docker CUPS from TCP to Unix socket
   - **Why:** CUPS 2.4 (Debian bookworm) removed `CUPS-Get-Devices` and `CUPS-Get-PPDs` over TCP for security reasons — `lpinfo -h cups:631 -v` returns HTTP 400 "Bad Request". Fixed by removing `CUPS_HOST: cups:631` and adding `CUPS_SERVER: /run/cups/cups.sock` to mediator env in both compose files, so cups binaries use the already-mounted Unix socket. Also removed `:ro` from the socket volume mount (lpadmin writes to the socket) and added `chmod 777 /run/cups` to entrypoint.sh so www-data can connect.
   - **Deferred:** Remote CUPS server (`printer.server` set in admin UI) still uses TCP; if that server also runs CUPS 2.4 it will hit the same restriction for lpinfo (not fixable from our side — remote lpinfo discovery is then unavailable, print jobs still work via `lp -h`).

## 819. ✅ Printer docs: rewrite technical setup guide + new German user guide
   - **Why:** `printer-server-setup.md` still described the old Raspberry Pi / env-var approach. No user-facing guide existed. Rewrote the technical doc to cover Docker CUPS, USB passthrough, custom PPD override, remote CUPS, and IPP Everywhere. Created `docs/user/Drucker-Einrichtung.md` (German) covering the full operator workflow step by step.
   - **Deferred:** Nothing.

## 818. ✅ Printer UX: inline setup guide, CUPS error surfacing (502), media datalist, PPD filter fix
   - **Why:** Device/PPD APIs silently returned empty arrays on CUPS error (`.catch(() => '')`), indistinguishable from "no devices found". Admin users had no guided path for first-time setup. PPD autocomplete was filtered to `?q=brother`, useless without Brother LPR packages. Added `<details>` inline guide with 7 steps + Häufige Fehler, replaced silent catch with HTTP 502.
   - **Deferred:** Nothing.

## 817. ✅ Printer queue UX improvements: detection feedback, media datalist, PPD filter fix, custom PPD override
   - **Why:** PPD autocomplete used `?q=brother` which returned nothing if drivers weren't from Brother's official LPR package. Empty device detection gave no feedback. Media field had no hints. Custom PPDs (e.g. extra label sizes) were lost on container rebuild. Fixed all four issues.
   - **Deferred:** Remote CUPS queue discovery (`lpstat -h <host> -p` endpoint). Setup guide modal.

## 816. ✅ Fix `testPrinterConnection`: `lpstat -d` → `lpstat -p` for per-queue status check
   - **Why:** `lpstat -d` shows the system default destination and ignores the queue argument. `lpstat -p <queue>` is the correct flag to check a specific printer's idle/ready status. All queues were always returning `printer_not_ready` despite being idle in CUPS.
   - **Deferred:** Nothing.

## 815. ✅ Fix lpadmin Unauthorized: add `AuthType None` to CUPS `/admin` location
   - **Why:** Modern CUPS implicitly requires user credentials on `/admin` even without explicit config. Network-level `Allow from` passed but the auth check rejected `lpadmin` calls. `AuthType None` disables the credential requirement while IP restrictions remain.
   - **Deferred:** Nothing.

## 814. ✅ Fix cups container healthcheck: `lpstat -H` → `lpstat -r | grep 'running'`
   - **Why:** `lpstat -H` on Debian outputs "localhost" (no colon), so `grep -q ':'` always returned 1, marking the cups service permanently unhealthy after 10 retries and blocking mediator startup. `lpstat -r` checks whether the scheduler is actually running, which is the real gate.
   - **Deferred:** Nothing.

## 813. ✅ Docker CUPS service + live printer management in admin UI
   - **Why:** Printer setup required manual CUPS install, driver config, and env-var editing on every new host. Now: `docker compose up` starts a CUPS container with Brother QL drivers; queue definitions live in the DB and are editable at runtime via Admin → Drucker-Queues and Admin → Drucker-Einstellungen. No restart needed to switch printers or reassign label types. New `app_settings` and `printer_queues` DB tables; `resolvePrinterQueue` reads DB with env-var fallback. Fixed bug: `-d <queue>` was only appended to `lp` when `PRINTER_SERVER` was set, so socket mode ignored queue selection entirely.
   - **Deferred:** arm64 driver support (Brother i386 .deb won't install on Raspberry Pi — use ARM .deb or `brother-ql` Python backend when needed). The cups/drivers/ directory is a placeholder; operator must supply .deb files from Brother's support site before building the CUPS image.

## 812. ✅ Add media reachability healthchecks + improved printer queue status
   - **Why:** WebDAV mounts can silently fail or become stale (blocking `fs.stat` indefinitely). Added `GET /api/media/health` with timeout-protected directory probes (`Promise.race` at 3 s) plus a DB-sampled image probe (10 random item_refs checked against the fetch roots) — catches both mount failures and naming-convention drift. Replaced the dumb `printerConfigured` boolean in `/api/admin/config` with per-queue test results in `/api/printer/status` (tests all six label-type queues in parallel, deduplicates shared queues). `SystemStatusCard` now shows live media reachability + image hit-rate + per-queue printer badges. `BoxDetail` photo error handler now sets state and shows "Foto konnte nicht geladen werden." instead of silent logging.
   - **Deferred:** Periodic background polling (currently on-demand at admin page load). Global media-down banner outside the admin page. Write-probe for writable staging dir confirmation.

## 778. ✅ item-a4 marketing sheet: landscape orientation, removed image, added instance specs + quality fields
   - **Why:** The sheet is placed alongside the physical item so no image is needed. Landscape A4 gives more horizontal room for a 3-column layout (QR/meta/price | reference specs | instance specs). Instance specs (`InstanceSpecs` from quality review) and the quality badge (1–5 scale with color coding) are now injected via two new payload fields (`instanceSpecs`, `quality`) added to `MarketingSheetPayload` and `buildMarketingSheetPayload`. The image attachment query and `imageUrl` field are removed from the payload.
   - **Deferred:** Nothing deferred.

## 777. ✅ Print label failure UX: human-readable errors + PDF link surfaced in both inline and card modes
   - **Why:** When the printer was not configured or unreachable, the component showed raw machine strings (e.g. `printer_queue_not_configured`) and only surfaced the preview URL in the card variant — the inline mode (used in tab-actions) showed nothing at all. Added `formatPrintReason()` to map known reason strings to German ("Kein Drucker konfiguriert", "Drucker antwortet nicht", "Drucker nicht erreichbar"). On failure, the PDF link renders as a `btn--primary` button labeled "Label als PDF öffnen" so the operator can always print manually. On success it stays as a subtle "PDF" text link. Inline mode now renders the same PDF link as a sibling button in the tab-actions group.
   - **Deferred:** A "retry" button (re-attempt print without regenerating the PDF) — not added; the existing "Label drucken" button already re-triggers the full flow. Persistent per-item print-failure state (cleared on page reload) — sessionStorage or event log would be needed.

## 773. ✅ A4 marketing sheet (Produktblatt) for items — printable shelf card with name, specs, price, CO₂, image, QR
   - **Why:** Added a new `'marketingsheet'` PrintLabelType that routes through the existing print pipeline (HTML-to-PDF via Chromium). Template `item-a4.html` follows the `shelf-a4` pattern and is injected with a richer payload (Langtext specs, Verkaufspreis, calculated CO₂ savings, first attachment image URL). A third "A4 Produktblatt" button is added to the item label dialog in `PrintLabelButton`. A `PRINTER_QUEUE_MARKETING` env var allows routing to a dedicated A4 printer queue (falls back to `PRINTER_QUEUE`).
   - **Deferred:** CO₂ badge only shown when a value can be calculated (category + quality known). Image only shown when an attachment exists. No dedicated printer queue is configured by default — operators must set `PRINTER_QUEUE_MARKETING` to target an A4 printer.

## 767. ✅ Network printer support: `lpstat` now passes `-h` to remote CUPS server when `PRINTER_SERVER` is set
   - **Why:** `lp` already forwarded `-h printerHost` to the remote CUPS server, but `lpstat` (used for printer status checks) did not — status checks would silently probe the local socket even when a remote server was configured. The fix passes `printerHost` into `runPrinterConnectionAttempt` and adds `-h` to the `lpstat` args, making status checks consistent with print dispatch. Change is gated on `PRINTER_SERVER` being non-empty, so the current local-socket setup is unaffected.
   - **Deferred:** `docker-compose.yml` socket mount cleanup (harmless to leave; user chose to keep it with a transition note in the plan).

## 768. ✅ Added `docs/detailed/printer-server-setup.md`: end-to-end Raspberry Pi CUPS print server setup guide
   - **Why:** No prior runbook existed for the network printer path; operators setting up the Raspi had no reference for CUPS config, driver install, label media sizes, env vars, or troubleshooting steps.
   - **Deferred:** nothing deferred.

## 20. ✅ Add bounded print/lpstat transient retry wrapper with structured attempt/final logs and env-configurable backoff, plus targeted retry behavior tests.
