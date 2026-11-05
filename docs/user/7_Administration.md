# Administration

Die Administration (Werkzeug-Symbol in der Navigation) enthält Einstellungen und Aktionen für das ganze System. Diese Seite beschreibt jede Karte.

> Aktionen in der Administration wirken auf alle Artikel oder auf das ganze System. Frag nach, wenn du nicht sicher bist, was eine Aktion bewirkt.

---

## Zugang

- **Mit Login (Firmenkonto):** Plattform-Admins sehen alle Karten. Admins einer Organisation sehen die Karten, die in der Tabelle unten mit „Admins“ markiert sind. Alle anderen sehen das Werkzeug-Symbol nicht oder erhalten **Kein Zugriff**.
- **Ohne Login (lokale Installation):** Die Seite zeigt **Administrationszugang**. Admin-Passwort eingeben → **Anmelden**. Die Anmeldung gilt, bis du den Browser-Tab schliesst.

Auch einige Funktionen ausserhalb der Administration sind nur für Admins, z. B. die Schalter im KI-Cockpit oder **Jetzt mit Shop synchronisieren**.

---

## Die Karten im Überblick

| Karte | Wofür | Wer |
|---|---|---|
<!-- if-feature: import-export -->
| **ZIP Import** | Daten aus einer Export-Datei einspielen | Admins |
| **Datenexport** | Artikel und Daten als Datei herunterladen | Admins |
<!-- end-feature -->
<!-- if-feature: admin-shelf-create -->
| **Regal erstellen** | Neues Regal mit eigener ID anlegen | Admins |
<!-- end-feature -->
<!-- if-feature: printing -->
| **Druckwarteschlange** | Offene und fehlgeschlagene Druckaufträge | Admins |
| **CUPS-Queues verwalten** | Drucker hinzufügen, prüfen, Treiber | Plattform-Admins |
| **Drucker-Einstellungen** | Welcher Drucker welches Etikett druckt | Plattform-Admins |
<!-- end-feature -->
<!-- if-feature: agentic -->
| **KI-Warteschlange** | Stand der KI-Läufe, fehlgeschlagene neu starten | Admins |
| **Agentische Auto-Verteilung** | Freie KI-Plätze automatisch füllen | Admins |
| **Self-Heal Vorschau** | Welche Artikel die KI neu bearbeiten würde | Admins |
<!-- end-feature -->
<!-- if-feature: admin-system-status -->
| **Systemstatus** | Ist alles erreichbar? | Admins |
<!-- end-feature -->
<!-- if-feature: erp-sync -->
| **Nächtliche ERP-Synchronisation** | Automatischen Abgleich mit dem ERP ein-/ausschalten | Plattform-Admins |
<!-- end-feature -->
<!-- if-feature: shopware -->
| **Shopware-Verbindung** | Verbindung zum Shop testen, alles synchronisieren | Plattform-Admins |
<!-- end-feature -->

Oben auf der Seite haben Plattform-Admins zusätzlich den Link **Organisationen verwalten**.
<!-- if-feature: admin-taxonomy -->
Daneben liegt **Taxonomie verwalten**.
<!-- end-feature -->

---

<!-- if-feature: import-export -->
## Daten importieren und exportieren

### ZIP Import

1. ZIP- oder CSV-Datei auswählen.
2. **Validieren** klicken. Das System prüft die Datei, ohne etwas zu ändern, und zeigt, wie viele Artikel und Behälter neu oder geändert würden.
3. Bei **Validierung erfolgreich**: **Upload** klicken. Nach **Import abgeschlossen** lädt die Seite neu.

> Immer zuerst validieren. Bei **Validierung fehlgeschlagen** steht unter **Fehler:** die fehlerhafte Zeile. Datei korrigieren und erneut validieren.

### Datenexport

1. Wähle das Format:
   - **Backup**: alle Artikel, Behälter, KI-Läufe und Ereignisse. Kann mit dem ZIP Import wieder eingelesen werden.
   - **ERP-Export**: Format für das ERP, Langtext mit Formatierung.
   - **Manuelle Übernahme**: Partner-CSV, Langtext ohne Formatierung.
   - **Automatischer Import**: Format für den automatischen ERP-Import.
2. Klick auf **Herunterladen**.

Einzelne Artikel exportieren: in der Artikelliste auswählen → **Export CSV** in der Aktionsleiste.

---
<!-- end-feature -->

<!-- if-feature: admin-shelf-create -->
## Regal erstellen

1. **Standort** und **Ebene** (Stockwerk) wählen.
2. Optional einen **Regalnamen** und **Zusätzliche Hinweise** eintragen.
3. **Regal erstellen** klicken. Das System vergibt die Regal-ID (`S-‹Standort›-‹Stockwerk›-‹Nr›`).

Danach das Regal-Label drucken und am Regal anbringen.

---
<!-- end-feature -->

<!-- if-feature: printing -->
## Drucker

- **Druckwarteschlange:** Ob der Drucker **Online** ist, Anzahl **Ausstehend** und **Fehlgeschlagen**, **Letzte Fehler**. Hier zuerst nachsehen, wenn nicht gedruckt wird.
- **CUPS-Queues verwalten:** Drucker hinzufügen, aktivieren, Aufträge abbrechen, Diagnose. Anleitung: [Drucker einrichten](/hilfe?doc=3_Drucker-Einrichtung).
- **Drucker-Einstellungen:** Pro Label-Typ (Artikel-Etiketten, Box-Etiketten, Regal (A4), Produktblatt (A4) …) eine Queue wählen, dazu eine **Standard-Queue (Fallback)**.

---
<!-- end-feature -->

<!-- if-feature: agentic -->
## KI-Karten

- **KI-Warteschlange:** Wie viele Läufe **Wartend**, **Zu prüfen**, **Abgeschlossen** und **Fehlgeschlagen** sind. Mit **… Fehlgeschlagene neu starten** startest du alle fehlgeschlagenen Läufe neu.
- **Agentische Auto-Verteilung:** **Aktiviert**: Wird ein Platz frei, startet automatisch ein Lauf für einen Artikel, der noch keinen KI-Lauf hatte. **Deaktiviert**: Läufe starten nur, wenn jemand sie startet.
- **Self-Heal Vorschau:** Liste der veralteten Artikel (z. B. nach geänderten Regeln für Spezifikationen) und was die automatische Nachbearbeitung mit ihnen machen würde. **Jetzt ausführen** startet die Nachbearbeitung sofort.

Dieselben Schalter und weitere Auswertungen sind im [KI-Cockpit](/hilfe?doc=10_KI-Cockpit).

---
<!-- end-feature -->

<!-- if-feature: admin-system-status -->
## Systemstatus

Eine Zeile pro Dienst: **API**, **Drucker**, **Medienspeicher** (Bilder, WebDAV), ERP und Shop. **Fehler** oder **WebDAV fehlt** zeigt, welcher Dienst nicht erreichbar ist; weiter mit der [Fehlerbehebung](/hilfe?doc=2_Fehlerbehebung). Darunter stehen die Anzahl **Artikel**, **Behälter** und **Bilder**.

---
<!-- end-feature -->

<!-- if-feature: erp-sync -->
## Nächtliche ERP-Synchronisation

**Aktiviert**: Das System gleicht jede Nacht die Artikel mit dem ERP ab. **Deaktivieren**, wenn das ERP gewartet wird oder fehlerhafte Daten übertragen werden. Danach wieder aktivieren.

---
<!-- end-feature -->

<!-- if-feature: shopware -->
## Shopware-Verbindung

- **Status** und **Sync-Warteschlange** zeigen, ob der Shop erreichbar ist und wie viele Artikel auf die Übertragung warten.
- **Verbindung testen** prüft die Zugangsdaten.
- **Alle synchronisieren** überträgt *alle* Shop-Artikel neu. Das dauert lange und ist für den Abgleich nach einer Störung gedacht. Für einzelne Artikel: **Shop Sync** in der Artikelliste.

---
<!-- end-feature -->

## Organisationen verwalten (Plattform-Admins)

Unter **Organisationen verwalten** legst du Organisationen an (Name, Kontakt-E-Mail für Bestellungen, Authentik-Gruppen für Benutzer und Admins) und ihre **Standorte** mit **Stockwerken**. Die Standort-ID wird Teil jeder Regal-ID und kann nicht mehr geändert werden.

<!-- if-feature: admin-taxonomy -->
## Taxonomie verwalten (Plattform-Admins)

Unter **Taxonomie verwalten** pflegst du Haupt- und Unterkategorien: Anzeigename, Code, Aliasse, ob die Kategorie **aktiv** ist und ob sie **im Intake-Menü** erscheint. Unter **Erweitert** liegen die Regeln für Qualität, Spezifikationen und Zerlegung.

> Änderungen an der Taxonomie gelten für alle Artikel der Kategorie. Sprich grössere Änderungen vorher mit den Entwickler:innen ab.
<!-- end-feature -->
