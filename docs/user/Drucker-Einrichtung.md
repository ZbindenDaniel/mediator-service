# Drucker einrichten

Diese Anleitung erklärt, wie du einen Etikettendrucker (z.B. Brother QL-500, QL-800) oder
einen Netzwerkdrucker mit dem System verbindest.

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

> Überspring diesen Schritt, wenn der Drucker bereits druckt oder wenn du einen
> Netzwerkdrucker (Brother QL-820NWB, QL-1110NWB, Laserdrucker …) verwendest.

1. Lade die Treiber für deinen Brother QL von
   [support.brother.com](https://support.brother.com) herunter.
   Du brauchst **zwei Dateien**:
   - `brother-QL800lpr-*.i386.deb` — LPR-Druckertreiber
   - `cupswrapperQL800-*.i386.deb` — CUPS-Wrapper
   *(Modellnummer an deinen Drucker anpassen)*
2. Kopiere beide Dateien in den Ordner `cups/drivers/` im Repository.
3. Baue den CUPS-Container neu und starte ihn:
   ```
   docker compose up --build cups
   ```

### Schritt 2: USB-Passthrough aktivieren

Damit CUPS den Drucker sehen kann, musst du den USB-Zugriff freischalten.
Starte den Stack mit:

```
docker compose -f docker-compose.yml -f docker-compose.usb.yml up -d
```

### Schritt 3: Drucker erkennen lassen

1. Öffne das **Admin-Panel** → **Drucker-Queues**.
2. Klick auf **Erkennen**.

Das System fragt CUPS ab und füllt die Autocomplete-Felder mit den gefundenen Geräten und Treibern.

*Erscheint eine Fehlermeldung statt Geräten, prüf den USB-Passthrough (Schritt 2).*

### Schritt 4: Queue anlegen

Eine **Queue** ist ein benannter Druckkanal. Leg für jede Etikettenrolle oder -grösse
eine eigene Queue an (empfohlen).

| Feld | Beispiel | Hinweis |
|------|---------|---------|
| Queue-Name | `QL800_box` | Keine Leerzeichen; frei wählbar |
| Device URI | `usb://Brother/QL-800?serial=G9G196637` | Aus Autocomplete wählen |
| PPD-Modell | `lsb/usr/Brother/brother_ql800_printer_en.ppd` | Aus Autocomplete wählen |
| Media | `w62h100` | Grösse der eingelegten Rolle — oder leer lassen (Drucker-Standard) |

Klick auf **Hinzufügen**.

> **Media leer lassen** bedeutet: CUPS verwendet den im PPD definierten Standard.
> **Explizite Grösse** (z.B. `w62h100`) verhindert, dass der Drucker das Etikett auf
> die falsche Rollengrösse skaliert — empfohlen, wenn du mehrere Rollen verwendest.

Häufige Rollengrössen:

| Code | Grösse | Verwendung |
|------|--------|-----------|
| `w62h100` | 62 × 100 mm | Karton-Etiketten |
| `w29h90` | 29 × 90 mm | Artikel-Etiketten |
| `w62` | 62 mm Endlosband | Endlosband |
| `w62h29` | 62 × 29 mm | Kleine Artikel |
| `w102` | 102 mm Endlosband | Breites Band |

### Schritt 5: Label-Typen zuweisen

Öffne **Admin-Panel** → **Drucker-Einstellungen** und weise jeder Etikettenart
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

Ersetze `<IP-Adresse>` durch die Netzwerkadresse deines Druckers.

Für einen externen CUPS-Druckserver (z.B. Raspberry Pi):

1. Öffne **Admin-Panel** → **Drucker-Einstellungen**.
2. Trag im Feld **Drucker-Server** die Adresse ein: `192.168.x.x:631`
3. Klick auf **Speichern**.
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

Falls dein Drucker eine Sondergrösse nicht kennt (z.B. 62 × 8 mm):

1. Such die PPD-Datei des Treibers:
   ```
   docker compose exec cups find /usr/share/ppd -name "*ql800*"
   ```
2. Kopiere sie aus dem Container:
   ```
   docker compose cp cups:/usr/share/ppd/.../brother_ql800_printer_en.ppd cups/ppds/
   ```
3. Öffne die Datei und füge einen neuen `*PageSize`-Eintrag ein
   (analog zu den bestehenden Einträgen).
4. Committe die veränderte PPD nach `cups/ppds/` ins Repository.
5. Neu bauen:
   ```
   docker compose up --build cups
   ```
   Beim nächsten Build überschreibt die modifizierte PPD automatisch die Treiber-Version.

---

*Technische Details: [`docs/detailed/printer-server-setup.md`](../detailed/printer-server-setup.md)*
