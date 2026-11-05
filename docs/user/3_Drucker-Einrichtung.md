# Drucker einrichten
<!-- feature: printing -->

Anleitung für Admins: Etikettendrucker (z. B. Brother QL-500, QL-800) oder Netzwerkdrucker mit dem System verbinden. Für die Befehle brauchst du Zugriff auf den Server.

---

## Wie das System druckt

Das System druckt über **CUPS** (Druckdienst unter Linux). Zwei Varianten:

| Variante | Wann |
|----------|------|
| **USB-Drucker am Server** | Der Drucker hängt per USB am Rechner, auf dem Docker läuft |
| **Netzwerkdrucker / externer Druckserver** | Der Drucker hat eine eigene Netzwerkverbindung oder hängt an einem anderen Gerät (Raspberry Pi, NAS) |

Die Einrichtung erfolgt in der **Administration**, Karten **CUPS-Queues verwalten** und **Drucker-Einstellungen**. Ein Neustart der App ist nicht nötig.

Begriffe:
- **Queue:** benannter Druckkanal in CUPS, z. B. `QL800_box`. Empfehlung: eine Queue pro Etikettenrolle bzw. -grösse.
- **Device URI:** Adresse des Druckers, z. B. `usb://Brother/QL-800?serial=…`.
- **PPD:** Treiberdatei, die CUPS sagt, wie der Drucker angesteuert wird.
- **Media:** Etikettengrösse, z. B. `w62h100`.

---

## Teil A: USB-Drucker am Server

### 1. USB-Zugriff freigeben

Der CUPS-Container sieht USB-Geräte nur, wenn der Stack mit der USB-Datei gestartet wird:

```
docker compose -f docker-compose.yml -f docker-compose.usb.yml up -d
```

### 2. Treiber prüfen und bei Bedarf installieren

Viele Brother-Modelle sind im CUPS-Container schon enthalten. Einige (z. B. QL-800, QL-810W) brauchen den Treiber von Brother:

1. Auf [support.brother.com](https://support.brother.com) zwei Dateien herunterladen (Modellnummer anpassen):
   - `brother-QL800lpr-*.i386.deb` (Druckertreiber)
   - `cupswrapperQL800-*.i386.deb` (CUPS-Wrapper)
2. Beide Dateien in den Ordner `cups/drivers/` im Repository kopieren.
3. CUPS-Container neu bauen:
   ```
   docker compose up --build cups
   ```

Ob ein Treiber da ist, siehst du in Schritt 3 im Feld **PPD-Modell**. Steht dort **Keine Treiber installiert.**, fehlt er.

### 3. Queue anlegen

In der Administration → **CUPS-Queues verwalten**, Formular **Queue hinzufügen**:

| Feld | Beispiel | Hinweis |
|------|---------|---------|
| **Queue-Name** | `QL800_box` | Ohne Leerzeichen, frei wählbar |
| **Device URI** | `usb://Brother/QL-800?serial=G9G196637` | **Scannen** klicken und den Drucker aus der Liste wählen |
| **PPD-Modell** | `lsb/usr/Brother/brother_ql800_printer_en.ppd` | Modellnummer eintippen (z. B. `800`) und Treiber aus der Liste wählen |
| **Media (CUPS Mediengrösse)** | `w62h100` | Grösse der eingelegten Rolle. Leer = Standard aus dem Treiber |
| **Beschreibung (optional)** | `Karton-Etiketten Lager` | Nur zur Orientierung |

**Queue aktiviert** anhaken → **Hinzufügen**.

Zeigt **Scannen** **Keine USB-Geräte erkannt.**, ist Schritt 1 nicht aktiv.

Media setzen ist empfohlen, wenn du mehrere Rollengrössen verwendest. Sonst kann der Drucker das Label auf die falsche Grösse skalieren.

| Code | Grösse |
|------|--------|
| `w62h100` | 62 × 100 mm |
| `w62h75` | 62 × 75 mm |
| `w62h29` | 62 × 29 mm |
| `w29h90` | 29 × 90 mm (Adressetikett) |
| `w17h54` | 17 × 54 mm |
| `w23h23` | 23 × 23 mm |
| `w62` | 62 mm Endlosband |
| `w102` | 102 mm Endlosband |

### 4. Label-Typen zuweisen

In der Administration → **Drucker-Einstellungen** jedem Label-Typ eine Queue zuweisen:

| Feld | Queue (Beispiel) |
|-----------|-----------------|
| **Box-Etiketten** | `QL800_box` |
| **Artikel-Etiketten** | `QL800_item` |
| **Artikel klein** | `QL800_small` |
| **Regal (A4)** | `A4_office` |
| **Produktblatt (A4)** | `A4_office` |
| **Standard-Queue (Fallback)** | wird verwendet, wenn ein Typ keine eigene Queue hat |

**Speichern** klicken. Danach ein Label testen.

---

## Teil B: Netzwerkdrucker (IPP)

Netzwerkfähige Drucker (z. B. Brother QL-820NWB, QL-1110NWB, die meisten Laser- und Tintenstrahldrucker) unterstützen IPP und brauchen keinen eigenen Treiber. Queue wie in Teil A, Schritt 3 anlegen, mit:

| Feld | Wert |
|------|------|
| **Device URI** | `ipps://<IP-Adresse>/ipp/print` |
| **PPD-Modell** | `everywhere` |

`<IP-Adresse>` durch die Adresse des Druckers ersetzen.

### Externer CUPS-Server (z. B. Raspberry Pi)

1. Administration → **Drucker-Einstellungen**.
2. **CUPS Server** eintragen, z. B. `192.168.x.x:631`. Leer = CUPS-Container auf dem Server.
3. **Speichern**.

**Scannen** fragt danach den externen Server ab.

---

## Häufige Probleme

| Problem | Ursache | Lösung |
|---------|---------|--------|
| **Scannen** zeigt einen Fehler | CUPS nicht erreichbar oder keine Berechtigung | `docker compose up --build cups` |
| **Keine USB-Geräte erkannt.** | USB-Zugriff nicht freigegeben | Mit `docker-compose.usb.yml` starten (Teil A, Schritt 1) |
| «printer_not_ready» | Queue ist in CUPS nicht registriert | Queue in der Administration speichern, dann mit `docker compose exec cups lpstat -p` prüfen |
| Label zu klein oder zu gross | Media passt nicht zur Rolle | **Media** der Queue auf die eingelegte Rolle setzen |
| Es wird nichts gedruckt | Label-Typ hat keine Queue | **Drucker-Einstellungen** prüfen |
| Laut Log gedruckt, aber kein Label | Falscher Treiber oder falsches Media | PPD-Modell und Media der Queue prüfen |

Die Karte **CUPS-Queues verwalten** hat unter **Einrichtungshilfe** dieselben Hinweise und eine Diagnose-Ansicht.

---

## Eigene Etikettengrösse

Kennt der Treiber eine Grösse nicht (z. B. 62 × 8 mm), muss sie in der PPD-Datei ergänzt werden:

1. PPD-Datei im Container suchen:
   ```
   docker compose exec cups find /usr/share/ppd -name "*ql800*"
   ```
2. Datei aus dem Container kopieren:
   ```
   docker compose cp cups:/usr/share/ppd/.../brother_ql800_printer_en.ppd cups/ppds/
   ```
3. In der Datei einen neuen `*PageSize`-Eintrag ergänzen (gleicher Aufbau wie die vorhandenen).
4. Geänderte Datei in `cups/ppds/` ins Repository committen.
5. Container neu bauen:
   ```
   docker compose up --build cups
   ```
   Die Datei aus `cups/ppds/` ersetzt dabei die Version des Treibers.

---

*Technische Details: [`docs/detailed/printer-server-setup.md`](../detailed/printer-server-setup.md)*
