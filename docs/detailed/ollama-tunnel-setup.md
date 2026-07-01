# Ollama SSH tunnel setup

The cloud app's agentic pipeline calls Ollama via HTTP. When Ollama runs on a local
bare-metal machine (not in the cloud), an SSH reverse tunnel makes it reachable from
the cloud server's loopback — the cloud app needs no code changes, only a one-line
env var pointing at `127.0.0.1:11434`.

## How it works

```
Local machine (Ollama on :11434)
  └── autossh -R 11434:localhost:11434 ollama-tunnel@cloud-server
            ↕ persistent SSH connection (dials OUT — NAT/firewall friendly)
Cloud server
  └── sshd binds 127.0.0.1:11434  (loopback only — not network-accessible)
            ↕
Cloud app: AGENTIC_OLLAMA_BASE_URL=http://127.0.0.1:11434
```

The local machine initiates the connection, same pattern as the print-agent WebSocket.
The cloud app sees Ollama as a local service; no inbound firewall rules needed.

---

## One-time cloud server setup

### 1. Create a restricted tunnel-only user

```bash
useradd -r -s /usr/sbin/nologin -m ollama-tunnel
mkdir -p /home/ollama-tunnel/.ssh
chmod 700 /home/ollama-tunnel/.ssh
```

### 2. Generate an SSH key pair (on any machine)

```bash
ssh-keygen -t ed25519 -f ollama_tunnel_key -C "mediator-ollama-tunnel" -N ""
# produces: ollama_tunnel_key (private) and ollama_tunnel_key.pub (public)
```

Keep the private key — it goes on the local Ollama machine. The public key goes on
the cloud server in the next step.

### 3. Authorize the key, restricted to port 11434 only

```bash
echo 'no-pty,no-agent-forwarding,no-X11-forwarding,permitopen="localhost:11434" '$(cat ollama_tunnel_key.pub) \
  >> /home/ollama-tunnel/.ssh/authorized_keys
chmod 600 /home/ollama-tunnel/.ssh/authorized_keys
chown -R ollama-tunnel:ollama-tunnel /home/ollama-tunnel/.ssh
```

The `permitopen` restriction means this key can only forward port 11434 — even if the
key is ever compromised, an attacker can't use it for shell access or to forward other
ports.

### 4. Verify sshd allows TCP forwarding

```bash
grep -E '^AllowTcpForwarding' /etc/ssh/sshd_config
# If missing or set to 'no', add/change to:
#   AllowTcpForwarding yes
# Then: systemctl reload sshd
```

`AllowTcpForwarding yes` is the default on most distributions — this step is usually
a no-op.

### 5. Set the cloud app env var

In `docker-compose.yml` (or `.env`), set on the `mediator` service:

```
AGENTIC_OLLAMA_BASE_URL=http://127.0.0.1:11434
```

---

## Local Ollama machine setup

### Option A — Docker (recommended)

Add to `docker-compose.worker.yml` or run standalone:

```yaml
services:
  ollama-tunnel:
    image: linuxserver/openssh-server   # or any image with autossh
    # simplest: build a one-liner Alpine image
    image: alpine
    command: >
      sh -c "apk add --no-cache autossh openssh-client &&
             autossh -N
               -o StrictHostKeyChecking=yes
               -o ServerAliveInterval=60
               -o ServerAliveCountMax=3
               -i /root/.ssh/ollama_tunnel_key
               -R 11434:host.docker.internal:11434
               -p 22
               ollama-tunnel@<CLOUD_SSH_HOST>"
    volumes:
      - ./secrets/ollama_tunnel_key:/root/.ssh/ollama_tunnel_key:ro
      - ./secrets/cloud_known_hosts:/root/.ssh/known_hosts:ro
    extra_hosts:
      - "host.docker.internal:host-gateway"
    restart: unless-stopped
```

Create `secrets/cloud_known_hosts` with the cloud server's host key:

```bash
ssh-keyscan -H <CLOUD_SSH_HOST> > secrets/cloud_known_hosts
```

Place the private key at `secrets/ollama_tunnel_key` (mode 600).

### Option B — systemd service (bare metal, no Docker)

```ini
# /etc/systemd/system/ollama-tunnel.service
[Unit]
Description=Ollama SSH reverse tunnel to cloud
After=network-online.target
Wants=network-online.target

[Service]
User=ollama-tunnel-local
ExecStart=/usr/bin/autossh -N \
  -o StrictHostKeyChecking=yes \
  -o ServerAliveInterval=60 \
  -o ServerAliveCountMax=3 \
  -i /etc/ollama-tunnel/id_ed25519 \
  -R 11434:127.0.0.1:11434 \
  ollama-tunnel@<CLOUD_SSH_HOST>
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
useradd -r -s /usr/sbin/nologin ollama-tunnel-local
mkdir /etc/ollama-tunnel
cp ollama_tunnel_key /etc/ollama-tunnel/id_ed25519
chmod 600 /etc/ollama-tunnel/id_ed25519
chown -R ollama-tunnel-local /etc/ollama-tunnel

systemctl daemon-reload
systemctl enable --now ollama-tunnel
```

---

## Verification

From the cloud server:

```bash
# Tunnel active?
ss -tlnp | grep 11434
# expected: 127.0.0.1:11434

# Ollama reachable through tunnel?
curl http://127.0.0.1:11434/api/tags
# expected: JSON list of locally-installed models
```

From the cloud app container:

```bash
docker exec mediator curl -s http://127.0.0.1:11434/api/tags | head -c 200
```

---

## Maintenance

- **Tunnel drops**: `autossh` reconnects automatically. No operator action needed.
- **Cloud server reboot**: tunnel re-establishes within a few seconds of the server
  coming back up (autossh retries with backoff).
- **Key rotation**: generate a new key pair, update `authorized_keys` on the cloud
  server (add new, remove old), replace the private key on the local machine, restart
  the tunnel service.
- **Ollama model updates**: `ollama pull <model>` on the local machine — no tunnel
  changes needed.

---

## Security notes

- The tunnel binds to `127.0.0.1:11434` on the cloud server — not to any network
  interface. Only processes on the cloud server can reach it.
- The SSH key's `permitopen="localhost:11434"` restriction means it cannot forward
  any other port, even if the key is compromised.
- Ollama itself has no authentication — the loopback-only binding is the sole access
  control. Do not expose Ollama's port to the network on the local machine either.
