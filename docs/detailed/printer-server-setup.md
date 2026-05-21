# Printer server setup (Raspberry Pi)

This guide covers everything needed to turn a Raspberry Pi into a CUPS print server
that mediator-service can use over the network. The mediator container renders label
HTML to PDF and submits the job via `lp -h <raspi>:631 -d <queue>`; CUPS on the Raspi
forwards it to the physical printer.

## Prerequisites

| Item | Notes |
|------|-------|
| Raspberry Pi (any model with Ethernet/Wi-Fi) | Tested with Raspberry Pi OS Lite (64-bit) |
| Physical label printer connected to the Raspi via USB | Brother QL series used at revamp-it |
| Static IP or stable hostname for the Raspi on the LAN | Required so the mediator container can reach it reliably |
| SSH access to the Raspi | All commands below are run on the Raspi unless stated otherwise |

---

## 1. Install CUPS

```bash
sudo apt update
sudo apt install -y cups cups-client
```

Add your user to the `lpadmin` group so you can manage printers without `sudo`:

```bash
sudo usermod -aG lpadmin $USER
# log out and back in, or: newgrp lpadmin
```

---

## 2. Allow remote connections

By default CUPS only listens on localhost. Edit the configuration to accept connections
from the local network:

```bash
sudo nano /etc/cups/cupsd.conf
```

Make these changes:

```
# Listen on all interfaces (or replace * with the Raspi's LAN IP)
Listen *:631

# Allow the web admin UI from the LAN
<Location />
  Order allow,deny
  Allow @LOCAL
</Location>

<Location /admin>
  Order allow,deny
  Allow @LOCAL
</Location>

<Location /printers>
  Order allow,deny
  Allow @LOCAL
</Location>
```

Restart CUPS to apply:

```bash
sudo systemctl restart cups
sudo systemctl enable cups   # start on boot
```

Verify it is listening:

```bash
ss -tlnp | grep 631
# should show 0.0.0.0:631
```

Open the web UI from another machine on the LAN: `http://<raspi-ip>:631`

---

## 3. Install the printer driver

### Brother QL series (QL-700, QL-800, QL-820NWB, etc.)

Option A — `brother-ql` Python package (recommended, no proprietary driver needed):

```bash
sudo apt install -y python3-pip python3-usb
pip3 install brother_ql
```

`brother_ql` can drive the printer directly, but to expose it as a standard CUPS queue
the easiest path is the official Brother CUPS backend:

Option B — Official Brother Linux driver (`.deb`):

1. Go to Brother's support site and download the **QL-XXX CUPS wrapper** and
   **LPR** packages for Linux (ARM `.deb` files for the Raspi).
2. Install both packages:
   ```bash
   sudo dpkg -i brother-ql800lpr-*.deb
   sudo dpkg -i cupswrapperql800-*.deb   # adjust model number
   ```
3. The driver registers itself with CUPS automatically.

For other printer models install the relevant CUPS driver or PPD from the manufacturer
or from `foomatic-db`:

```bash
sudo apt install -y printer-driver-foo2zjs foomatic-db foomatic-db-engine
```

---

## 4. Add the printer to CUPS

### Via the web UI

1. Open `http://<raspi-ip>:631` → Administration → Add Printer.
2. Select the USB-connected printer from the list.
3. Name the queue (this becomes your `PRINTER_QUEUE_*` value in `.env`), e.g. `QL800`.
4. Select the correct PPD / driver.
5. Set the default media to match the label roll currently loaded (see label sizes below).

### Via command line (`lpadmin`)

```bash
# List detected printers (find the URI)
lpinfo -v | grep -i brother

# Add a queue named QL800 (adjust URI and PPD path for your model)
sudo lpadmin -p QL800 \
  -E \
  -v usb://Brother/QL-800?serial=... \
  -m brother_ql800.ppd \
  -o media=w62h100   # default media — see table below

# Set as default queue (optional)
sudo lpoptions -d QL800
```

---

## 5. Label sizes and media names

mediator-service renders one PDF page per label at the exact size declared in the CSS
`@page` rule. CUPS must accept that page size without rescaling. Set the **default media**
of each queue to match the roll currently loaded.

| Label type | PDF page size | Typical CUPS media name |
|-----------|--------------|------------------------|
| Box | 62 × 100 mm | `w62h100` |
| Item | 90 × 29 mm (landscape) | `w90h29` / `w29h90` |
| Small item | 62 × 10 mm | `w62h10` |
| Shelf | A4 | `iso_a4_210x297mm` |

Check what names your driver accepts:

```bash
lpoptions -p QL800 -l | grep -i media
```

Set the default for a queue:

```bash
sudo lpoptions -p QL800 -o media=w62h100
```

### One queue per roll (recommended)

If you swap rolls manually, create a separate queue per size and point each
`PRINTER_QUEUE_*` env var at the matching queue. This prevents CUPS from resizing
the PDF to the wrong media.

```bash
# Example: two queues for box and item labels
sudo lpadmin -p QL800_box  -E -v usb://Brother/QL-800?serial=... -m brother_ql800.ppd -o media=w62h100
sudo lpadmin -p QL800_item -E -v usb://Brother/QL-800?serial=... -m brother_ql800.ppd -o media=w90h29
```

---

## 6. Verify from the Raspi

```bash
# List configured queues
lpstat -p

# Print a test page to a specific queue
lp -d QL800 /usr/share/cups/data/testprint

# Print a PDF file
lp -d QL800 /path/to/label.pdf
```

Expected `lpstat -p` output when the printer is ready:

```
printer QL800 is idle.  enabled since ...
```

---

## 7. Configure mediator-service

Edit `.env` on the server running the mediator container:

```env
# IP or hostname of the Raspi, with CUPS port
PRINTER_SERVER=192.168.x.x:631

# Queue names on the Raspi (must match lpadmin -p names exactly)
PRINTER_QUEUE=QL800           # fallback used when label-specific queue is missing
PRINTER_QUEUE_BOX=QL800_box
PRINTER_QUEUE_ITEM=QL800_item
PRINTER_QUEUE_ITEM_SMALL=QL800_item
PRINTER_QUEUE_SHELF=QL800     # A4 printer or a second queue if you have one
```

Restart the container to pick up the new env vars:

```bash
docker compose up -d --force-recreate
```

Verify connectivity from the mediator:

```
GET /api/printer/status
→ { "ok": true }
```

Check container logs if the status check fails:

```bash
docker compose logs mediator | grep '\[print\]'
```

---

## 8. Firewall

If `ufw` is active on the Raspi, allow CUPS from the LAN:

```bash
sudo ufw allow from 192.168.0.0/16 to any port 631
sudo ufw reload
```

---

## 9. Transitioning from local (socket) to network printing

The current `docker-compose.yml` mounts the host CUPS socket:

```yaml
- /run/cups:/run/cups:ro
```

This is harmless when `PRINTER_SERVER` is set — the `lp -h` flag routes jobs to the
Raspi and the local socket is ignored. You can cut over and fall back by toggling
`PRINTER_SERVER` in `.env` without touching Compose.

When you are ready to permanently remove the local-socket dependency:

1. Delete the `- /run/cups:/run/cups:ro` line from `docker-compose.yml`.
2. Run `docker compose up -d --force-recreate`.

---

## 10. Troubleshooting

| Symptom | Check |
|---------|-------|
| `/api/printer/status` returns `ok: false, reason: "status_timeout"` | CUPS not reachable — verify `PRINTER_SERVER`, firewall, and that `ss -tlnp` shows `*:631` on the Raspi |
| `lpstat_exit_1` or `printer_not_ready` | Queue name wrong or printer offline — run `lpstat -h <raspi>:631 -p` from the host |
| `lp: error - unable to connect to server` in container logs | Network routing issue — confirm the container can reach the Raspi IP (`docker compose exec mediator ping <raspi-ip>`) |
| Job accepted but nothing prints | Driver or media mismatch — check the CUPS error log on the Raspi (`sudo journalctl -u cups -f`) |
| PDF printed at wrong size / cropped | Default media on the CUPS queue does not match the label dimensions — update with `lpoptions -p <queue> -o media=<size>` |

### Logs on the Raspi

```bash
# CUPS error log
sudo journalctl -u cups -f

# Or the traditional log file
sudo tail -f /var/log/cups/error_log
```

### Test `lp` directly from the host server (bypasses the container)

```bash
lp -h <raspi-ip>:631 -d QL800 /path/to/test.pdf
```

If this works but the container cannot print, the issue is Docker networking, not CUPS.
