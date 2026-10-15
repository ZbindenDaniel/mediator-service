# Deployment guide

How a new version gets from a laptop to the production host. Written for whoever does a release;
no CI knowledge needed. Background and the CI workflows are in [`docs/setup.md`](../setup.md).

```
laptop: docker build → docker push ──▶ gitea.revamp-it.ch (registry) ──▶ host: docker compose pull + up -d
```

- **Registry:** `gitea.revamp-it.ch`, image `gitea.revamp-it.ch/revamp-it/mediator-service:<version>`
  (visible under the org → Packages).
- **Host:** a directory (e.g. `/opt/mediator`) holding `docker-compose.prod.yaml`, the overrides you
  use (`.prod.authentik.yaml`, `.prod.printing.yaml`) and `.env`. Only the `mediator` image comes from
  the registry; `postgres`, `redis`, `authentik` come from Docker Hub/ghcr, `cups` (printing only) is
  built on the host.

## 1. One-time setup

**Laptop (to push):** create a Gitea access token with `write:package` (gitea.revamp-it.ch → Settings →
Applications), then:
```bash
docker login gitea.revamp-it.ch -u <gitea-user>      # password = the token
```

**Host (to pull):** same, a token with `read:package` is enough. Then put the compose files **from the
repo** into the deploy directory — don't keep hand-edited copies with other names:
```bash
scp docker-compose.prod.yaml docker-compose.prod.authentik.yaml host:/opt/mediator/
# only with label printers (CUPS is built on the host):
scp -r docker-compose.prod.printing.yaml cups host:/opt/mediator/
```

**Host `.env`** — besides the app config, the deploy needs:
```bash
VM_IP=192.168.x.y
MEDIATOR_IMAGE=gitea.revamp-it.ch/revamp-it/mediator-service:4.1   # the version to run
MEDIATOR_DOMAIN=erfassung.example.ch      # only with Authentik; default erfassung.<VM_IP>.nip.io
AUTHENTIK_DOMAIN=auth.example.ch          # only with Authentik; default auth.<VM_IP>.nip.io
AUTHENTIK_ENABLED=true                    # only with Authentik (+ AUTHENTIK_SECRET_KEY, AUTHENTIK_PG_PASSWORD)
PRINTING_ENABLED=false                    # only without printers: the deploy workflow then leaves out CUPS
```
Without `MEDIATOR_IMAGE` the compose file falls back to the old `ghcr.io/…:3.0` image.

## 2. Release (laptop)

```bash
V=4.2
docker build -t gitea.revamp-it.ch/revamp-it/mediator-service:$V .
docker push gitea.revamp-it.ch/revamp-it/mediator-service:$V
```
Build from a clean, committed tree so the version maps to a commit (`git tag v$V && git push --tags`).

## 3. Deploy (host)

```bash
cd /opt/mediator
sed -i "s|^MEDIATOR_IMAGE=.*|MEDIATOR_IMAGE=gitea.revamp-it.ch/revamp-it/mediator-service:4.2|" .env

F="-f docker-compose.prod.yaml -f docker-compose.prod.authentik.yaml"   # drop the 2nd file without Authentik
F="$F -f docker-compose.prod.printing.yaml"                              # only with label printers (CUPS)
docker compose $F pull --ignore-buildable     # fetch first: a failed pull leaves the running stack alone
docker compose $F up -d                        # recreates only what changed
docker compose $F ps                           # all healthy?
docker compose $F logs -f --tail=100 mediator
```
- Use `up -d`, not `up --build` in the foreground: `--build` only rebuilds `cups`, and foreground mode
  stops the stack when the terminal closes. Rebuild cups explicitly when it changed: `docker compose $F up -d --build cups`.
- On a printing host, always pass the printing file: without it a recreated `mediator` loses its CUPS
  socket and printer settings.
- DB migrations run on mediator startup — watch the log for errors before calling it done.

**Rollback:** set `MEDIATOR_IMAGE` back to the previous version and run `up -d` again. (Schema changes
are additive, but check the changelog of the version you are leaving.)

## 4. Troubleshooting

| Message | Cause | Fix |
|---|---|---|
| `tls: failed to verify certificate: x509: certificate has expired or is not yet valid … is after 2023-…` | The host reaches a **different server** than the real gitea (whose Let's Encrypt cert is current): split DNS / `/etc/hosts` pointing at an internal IP, or a router/NAT-loopback answering on 443 with an old cert. If the "current time" in the message is wrong, it's the host clock instead. | On the host: `getent hosts gitea.revamp-it.ch` (public IP is `77.109.139.69`), `grep gitea /etc/hosts`, and `echo \| openssl s_client -connect gitea.revamp-it.ch:443 -servername gitea.revamp-it.ch 2>/dev/null \| openssl x509 -noout -issuer -dates`. Fix the DNS/hosts entry, or renew the cert on the internal endpoint. Don't add the registry to `insecure-registries`. |
| `unauthorized: reqPackageAccess` | Not logged in to that registry, token lacks the package scope, or no write access to the owner in the image path (`revamp-it/…`). | `docker login gitea.revamp-it.ch` with a token that has `write:package` (push) / `read:package` (pull). |
| `Image … Interrupted` for redis/authentik | Not an error of their own — compose stops the other pulls when one fails. | Fix the failing image (usually the mediator line). |
| `No such image: …` after a failed pull | Same — follow-up of the failed pull. | Same. |
| `The "MEDIATOR_DOMAIN" variable is not set. Defaulting to a blank string` | The compose file on the host is not the repo's (the repo's has defaults), e.g. a hand-made `docker-compose.authentik.yaml`. | Copy `docker-compose.prod.authentik.yaml` from the repo and set `MEDIATOR_DOMAIN` in `.env`. |
| App still shows the old version | `MEDIATOR_IMAGE` not set/changed, so the `ghcr.io/…:3.0` default ran. | `docker compose $F config \| grep image:` shows what will run. |
