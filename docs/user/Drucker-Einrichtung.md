# Drucker einrichten

Diese Anleitung erklärt, wie Sie einen Etikettendrucker (z.B. Brother QL-500, QL-800) oder
einen Netzwerkdrucker mit dem System verbinden.

---

## Überblick: Wie funktioniert das Drucken?

Das System druckt über **CUPS** (ein Druckerverwaltungsdienst). Es gibt zwei Wege:

| Variante | Wann sinnvoll |
|----------|--------------|
| **USB-Drucker direkt am Server** | Drucker ist per USB-Kabel an den Computer angeschlossen, der Docker ausführt |
| **Drucker an einem anderen Gerät** | Drucker hängt an einem Raspberry Pi, NAS, oder hat eine eigene Netzwerkverbindung |

Beides wird über das **Admin-Panel** konfiguriert — kein Neustart nötig.

---

## Teil A — USB-Drucker am Server

### Schritt 1: Treiber installieren

> Überspringen Sie diesen Schritt, wenn der Drucker bereits druckt oder wenn Sie einen
> Netzwerkdrucker (Brother QL-820NWB, QL-1110NWB, Laserdrucker …) verwenden.

1. Laden Sie die Treiber für Ihren Brother QL von
   [support.brother.com](https://support.brother.com) herunter.
   Sie benötigen **zwei Dateien**:
   - `brother-QL800lpr-*.i386.deb` — LPR-Druckertreiber
   - `cupswrapperQL800-*.i386.deb` — CUPS-Wrapper
   *(Modellnummer an Ihren Drucker anpassen)*
2. Kopieren Sie beide Dateien in den Ordner `cups/drivers/` im Repository.
3. Bauen Sie den CUPS-Container neu und starten Sie ihn:
   ```
   docker compose up --build cups
   ```

### Schritt 2: USB-Passthrough aktivieren

Damit CUPS den Drucker sehen kann, müssen Sie den USB-Zugriff freischalten.
Starten Sie den Stack mit:

```
docker compose -f docker-compose.yml -f docker-compose.usb.yml up -d
```

### Schritt 3: Drucker erkennen lassen

1. Öffnen Sie das **Admin-Panel** → **Drucker-Queues**.
2. Klicken Sie auf **Erkennen**.

Das System fragt CUPS ab und füllt die Autocomplete-Felder mit den gefundenen Geräten und Treibern.

*Erscheint eine Fehlermeldung statt Geräten, prüfen Sie den USB-Passthrough (Schritt 2).*

### Schritt 4: Queue anlegen

Eine **Queue** ist ein benannter Druckkanal. Legen Sie für jede Etikettenrolle oder -grösse
eine eigene Queue an (empfohlen).

| Feld | Beispiel | Hinweis |
|------|---------|---------|
| Queue-Name | `QL800_box` | Keine Leerzeichen; frei wählbar |
| Device URI | `usb://Brother/QL-800?serial=G9G196637` | Aus Autocomplete wählen |
| PPD-Modell | `lsb/usr/Brother/brother_ql800_printer_en.ppd` | Aus Autocomplete wählen |
| Media | `w62h100` | Grösse der eingelegten Rolle — oder leer lassen (Drucker-Standard) |

Klicken Sie auf **Hinzufügen**.

> **Media leer lassen** bedeutet: CUPS verwendet den im PPD definierten Standard.
> **Explizite Grösse** (z.B. `w62h100`) verhindert, dass der Drucker das Etikett auf
> die falsche Rollengrösse skaliert — empfohlen, wenn Sie mehrere Rollen verwenden.

Häufige Rollengrössen:

| Code | Grösse | Verwendung |
|------|--------|-----------|
| `w62h100` | 62 × 100 mm | Karton-Etiketten |
| `w29h90` | 29 × 90 mm | Artikel-Etiketten |
| `w62` | 62 mm Endlosband | Endlosband |
| `w62h29` | 62 × 29 mm | Kleine Artikel |
| `w102` | 102 mm Endlosband | Breites Band |

### Schritt 5: Label-Typen zuweisen

Öffnen Sie **Admin-Panel** → **Drucker-Einstellungen** und weisen Sie jeder Etikettenart
die passende Queue zu:

| Label-Typ | Queue (Beispiel) |
|-----------|-----------------|
| Box-Etikett | `QL800_box` |
| Artikel-Etikett | `QL800_item` |
| Regal-Etikett | `QL800_shelf` |
| Marketingblatt | `QL800_a4` |

---

## Teil B — Netzwerkdrucker / IPP

Brother QL-820NWB, QL-1110NWB oder beliebige Laser-/Tintenstrahldrucker mit Netzwerkanschluss
unterstützen IPP — es werden **keine Treiber** benötigt.

| Feld | Wert |
|------|------|
| Device URI | `ipps://<IP-Adresse>/ipp/print` |
| PPD-Modell | `everywhere` |

Ersetzen Sie `<IP-Adresse>` durch die Netzwerkadresse Ihres Druckers.

Für einen externen CUPS-Druckserver (z.B. Raspberry Pi):

1. Öffnen Sie **Admin-Panel** → **Drucker-Einstellungen**.
2. Tragen Sie im Feld **Drucker-Server** die Adresse ein: `192.168.x.x:631`
3. Klicken Sie auf **Speichern**.
4. Die Geräteerkennung fragt nun den externen Server ab.

---

## Häufige Probleme

| Problem | Mögliche Ursache | Lösung |
|---------|-----------------|--------|
| «Erkennen» zeigt Fehler | CUPS nicht erreichbar oder Unauthorized | `docker compose up --build cups` (Treiber + Konfiguration neu laden) |
| Keine USB-Geräte erkannt | USB-Passthrough nicht aktiv | Mit `docker-compose.usb.yml` starten (Schritt 2) |
| «printer_not_ready» | Queue nicht in CUPS registriert | Queue im Admin speichern; dann `docker compose exec cups lpstat -p` prüfen |
| Etikett zu klein/gross gedruckt | Media-Code falsch | Media in der Queue auf die eingelegte Rollengrösse setzen |
| Druckt gar nichts | Label-Typ ohne Queue | Drucker-Einstellungen prüfen — alle Label-Typen müssen einer Queue zugewiesen sein |

---

## Benutzerdefinierte Etikettengrössen

Falls Ihr Drucker eine Sondergrösse nicht kennt (z.B. 62 × 8 mm):

1. Suchen Sie die PPD-Datei des Treibers:
   ```
   docker compose exec cups find /usr/share/ppd -name "*ql800*"
   ```
2. Kopieren Sie sie aus dem Container:
   ```
   docker compose cp cups:/usr/share/ppd/.../brother_ql800_printer_en.ppd cups/ppds/
   ```
3. Öffnen Sie die Datei und fügen Sie einen neuen `*PageSize`-Eintrag ein
   (analog zu den bestehenden Einträgen).
4. Committen Sie die veränderte PPD nach `cups/ppds/` ins Repository.
5. Neu bauen:
   ```
   docker compose up --build cups
   ```
   Beim nächsten Build überschreibt die modifizierte PPD automatisch die Treiber-Version.

---

*Technische Details: [`docs/detailed/printer-server-setup.md`](../detailed/printer-server-setup.md)*
