# Printer setup

mediator-service can print labels and A4 sheets via any CUPS-accessible printer.
Two modes are supported and can be combined:

| Mode | When to use |
|------|-------------|
| **Docker CUPS** (default) | USB printer physically attached to the server running Docker |
| **Remote CUPS server** | Printer on a Raspberry Pi, NAS, or another machine; or IPP-capable network printer |

Both modes are configured at runtime via Admin → Drucker-Queues and Admin → Drucker-Einstellungen. No container restart is needed after the initial setup.

---

## Mode 1 — Docker CUPS (USB printer on the Docker host)

### 1.1 Start without a USB printer

The `cups` service starts without a printer — useful for verifying the stack before hardware is connected.

```bash
docker compose up
```

`docker compose ps` should show `mediator-cups` as healthy within ~15 s.

### 1.2 USB passthrough

USB devices are not passed through by default (the stack must start on hosts without a printer).
When a printer is physically connected, use the USB override:

```bash
docker compose -f docker-compose.yml -f docker-compose.usb.yml up -d
```

`docker-compose.usb.yml` adds `devices: - /dev/bus/usb:/dev/bus/usb` to the `cups` service.
Commit this to your deployment workflow when USB is permanently connected.

### 1.3 Install printer drivers

Brother QL drivers are not bundled in the image (binary `.deb` files are not committed to the repo).

1. Download the **LPR** and **CUPS wrapper** `.deb` packages for your QL model from
   [support.brother.com](https://support.brother.com) — choose the **Linux** / **i386** variant
   (even on amd64 hosts; the Dockerfile enables i386 multiarch).
   - Example: `brother-QL800lpr-1.1.3-0.i386.deb` + `cupswrapperQL800-1.1.4-0.i386.deb`
2. Place them in `cups/drivers/`.
3. Rebuild and restart the cups service:
   ```bash
   docker compose up --build cups
   ```

For arm64 hosts (Raspberry Pi 5, Apple Silicon Linux VM): use the **ARM** `.deb` packages from
Brother's site instead of i386.

For network/IPP printers (no USB): skip this step entirely — see Mode 2.

### 1.4 Discover the device URI and available drivers

```bash
# List detected USB devices
docker compose exec cups lpinfo -v

# List installed drivers/PPDs
docker compose exec cups lpinfo -m
```

Save the `usb://…` URI and the PPD path — you will enter these in the admin UI.

### 1.5 Create a queue in the admin UI

1. Open Admin → **Drucker-Queues**.
2. Click **Erkennen** — populates device URI and PPD autocomplete from the live CUPS container.
3. Fill in:
   - **Queue-Name**: choose freely, e.g. `QL800_box` (no spaces)
   - **Device URI**: select from autocomplete or paste from `lpinfo -v`
   - **PPD-Modell**: select from autocomplete or paste from `lpinfo -m`
   - **Media**: leave blank to use the PPD default, or enter a size code (see §5)
4. Click **Hinzufügen**.

The mediator calls `lpadmin` to register the queue in CUPS immediately.

### 1.6 Assign queues to label types

Open Admin → **Drucker-Einstellungen** and map each label type (Box, Artikel, Regal, …)
to the queue name you just created. Changes take effect for the next print job — no restart needed.

---

## Mode 2 — Remote CUPS server

Use this when the printer is on another machine (Raspberry Pi, dedicated print server)
or is a network printer supporting IPP.

### 2.1 Configure the print server address

Open Admin → **Drucker-Einstellungen** → **Drucker-Server** and enter `<hostname-or-ip>:631`.

The mediator passes `-h <server>` to every `lp`, `lpinfo`, and `lpadmin` call, so the admin
UI's device discovery also queries the remote server.

To revert to the built-in Docker CUPS container, clear the field.

### 2.2 Network / IPP printers (no driver required)

Modern network printers support IPP Everywhere — no PPD or driver install needed.

| Field | Value |
|-------|-------|
| Device URI | `ipps://<printer-ip>/ipp/print` (or `ipp://` for HTTP) |
| PPD-Modell | `everywhere` |

Works for A4 laser/inkjet printers and for Brother QL-820NWB / QL-1110NWB over Wi-Fi.

### 2.3 Set up a Raspberry Pi as a print server

```bash
# On the Raspberry Pi
sudo apt update && sudo apt install -y cups cups-client
sudo usermod -aG lpadmin $USER

# Allow remote access
sudo sed -i 's/^Listen localhost:631/Listen *:631/' /etc/cups/cupsd.conf
sudo sed -i '/<Location \/>/{n; s/Order allow,deny/Order allow,deny\n  Allow @LOCAL/}' /etc/cups/cupsd.conf
sudo systemctl restart cups && sudo systemctl enable cups
```

Install the Brother driver `.deb` packages (ARM variant for Raspi) and add the queue as in §1.4–1.5,
but run `lpinfo` against the Raspi instead of the Docker container:

```bash
lpinfo -h <raspi-ip>:631 -v
```

---

## Mode 3 — Environment variable fallback

If no DB override is set for a label type, the mediator falls back to env vars defined in
`docker-compose.yml` (or `.env`):

```env
PRINTER_QUEUE=QL800_box         # default fallback
PRINTER_QUEUE_BOX=QL800_box
PRINTER_QUEUE_ITEM=QL800_item
PRINTER_QUEUE_ITEM_SMALL=QL800_item
PRINTER_QUEUE_SHELF=QL800_shelf
PRINTER_QUEUE_MARKETING=QL800_a4
PRINTER_SERVER=                 # empty = use Docker CUPS socket
```

The priority chain is: **DB setting → env var → empty** (no print attempted).

---

## 5. Media sizes (label rolls)

Each CUPS queue has a **default media** used when a job doesn't specify a size.
Set it either in the admin UI (Media field) or with:

```bash
docker compose exec cups lpoptions -p <queue> -o media=<code>
```

Common sizes for Brother QL printers:

| Code | Dimensions | Label type |
|------|-----------|------------|
| `w62` | 62 mm continuous | continuous band |
| `w62h100` | 62 × 100 mm | box labels |
| `w29h90` | 29 × 90 mm | item / address labels |
| `w62h29` | 62 × 29 mm | small item |
| `w17h54` | 17 × 54 mm | narrow labels |
| `w62h75` | 62 × 75 mm | medium |
| `w23h23` | 23 × 23 mm | square |
| `w102` | 102 mm continuous | wide band |
| `iso_a4_210x297mm` | A4 | shelf / marketing sheets |

### One queue per roll size (recommended)

Create a separate queue for each label roll and point the matching label type at it.
This prevents CUPS from rescaling a 62×100 mm PDF to fit a 29×90 mm roll.

### Custom / non-standard sizes

1. Edit the PPD file for your printer to add a custom `*PageSize` entry.
2. Save the modified PPD as `cups/ppds/<original-filename>.ppd` in the repo.
   The filename must match the installed PPD exactly (e.g. `brother_ql800_printer_en.ppd`).
3. Rebuild: `docker compose up --build cups` — the Dockerfile copies the override PPD on top
   of the driver-installed one.

To find the original PPD filename:
```bash
docker compose exec cups lpinfo -m | grep -i ql800
# → lsb/usr/Brother/brother_ql800_printer_en.ppd  Brother QL-800 series
docker compose exec cups find /usr/share/ppd -name "brother_ql800*"
```

---

## 6. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `lpadmin: Unauthorized` in mediator logs | CUPS `/admin` requires credentials | Rebuild cups: `docker compose up --build cups` (AuthType None in cupsd.conf) |
| `printer_not_ready` for all queues | Queue not registered in CUPS | Check `docker compose exec cups lpstat -p`; resave the queue from admin UI |
| Device detection returns error in UI | CUPS unreachable or Unauthorized | Check `docker compose logs cups`; ensure cups is healthy |
| No USB devices detected | USB passthrough not active | Use `docker-compose.usb.yml`; check `docker compose exec cups ls /dev/bus/usb/` |
| Job accepted, nothing prints | Driver/media mismatch or printer offline | `docker compose exec cups lpstat -p`; check cups logs |
| PDF printed at wrong size | Media code mismatch | Verify Media field in admin UI matches the loaded roll |
| `cups` service never becomes healthy | `lpstat -r` fails | `docker compose logs cups`; cupsd startup error |

### Useful diagnostic commands

```bash
# CUPS scheduler status
docker compose exec cups lpstat -r

# All configured queues + status
docker compose exec cups lpstat -p

# Print a test page to a specific queue
docker compose exec cups lp -d <queue> /usr/share/cups/data/testprint

# Raw CUPS log
docker compose logs cups

# Mediator print subsystem logs
docker compose logs mediator | grep '\[print\]'
```

---

## 7. Architecture reference

```
┌─────────────────────────────────────────────┐
│  mediator container                          │
│  ─ renders label HTML → PDF                 │
│  ─ calls lp -d <queue> [-h <server>]        │
│  ─ calls lpadmin / lpinfo via cups-client   │
└───────────────┬─────────────────────────────┘
                │ Docker named volume (cups-socket)
                │ or TCP  <server>:631
┌───────────────▼─────────────────────────────┐
│  CUPS (Docker service or remote server)      │
│  ─ registers queue via lpadmin              │
│  ─ routes job to printer via USB / IPP      │
└───────────────┬─────────────────────────────┘
                │ USB or network
        ┌───────▼───────┐
        │ Physical       │
        │ printer        │
        └───────────────┘
```

Queue definitions (device URI, PPD, media) live in the `printer_queues` DB table.
Label-type → queue routing lives in the `system_settings` DB table.
Both are editable at runtime via the admin UI; env vars serve as fallback defaults.
