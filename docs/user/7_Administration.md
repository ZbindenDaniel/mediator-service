# Administration

Die Administration (Werkzeug-Symbol in der Navigation) bündelt alles, was das ganze System betrifft — nicht einzelne Artikel. Diese Seite erklärt, welche Karte wofür da ist.

> Hier wird am System selbst geschraubt. Wenn du nicht sicher bist, was eine Aktion auslöst: erst fragen, dann klicken.

---

## Wer kommt hinein?

- **Mit Login (Firmenkonto):** Plattform-Admins sehen alles. Admins einer Organisation sehen die Karten für den laufenden Betrieb (in der Tabelle unten mit „Admins“ markiert). Alle anderen sehen das Werkzeug-Symbol gar nicht oder bekommen **Kein Zugriff**.
- **Ohne Login (lokale Installation):** Die Seite fragt nach dem **Administrationszugang**. Gib das Admin-Passwort ein und klick auf **Anmelden**. Das Passwort gilt, bis du den Browser-Tab schliesst.

Einige Schalter ausserhalb der Administration (z. B. im KI-Cockpit oder **Jetzt mit Shop synchronisieren**) funktionieren ebenfalls nur für Admins.

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

1. Klick auf das Dateifeld und wähle die ZIP- oder CSV-Datei.
2. Klick zuerst auf **Validieren**. Das System prüft die Datei, ohne etwas zu ändern, und zeigt, wie viele Artikel und Behälter neu oder geändert wären.
3. Steht dort **Validierung erfolgreich**, klick auf **Upload**. Nach **Import abgeschlossen** lädt die Seite neu.

> Immer zuerst validieren. Bei **Validierung fehlgeschlagen** steht unter **Fehler:**, welche Zeile das Problem ist — Datei korrigieren und erneut prüfen.

### Datenexport

1. Wähle das Format:
   - **Backup** — vollständiges, wiederherstellbares Archiv mit Artikeln, Behältern, KI-Läufen und Ereignissen. Das ist die Sicherung, die der ZIP Import wieder einlesen kann.
   - **ERP-Export** — ERP-kompatibles Format mit formatiertem Langtext.
   - **Manuelle Übernahme** — Partner-CSV mit einfachem Langtext.
   - **Automatischer Import** — Format für den automatischen ERP-Import.
2. Klick auf **Herunterladen**.

Nur ein paar Artikel? In der Artikelliste auswählen → **Export CSV** in der Aktionsleiste.

---
<!-- end-feature -->

<!-- if-feature: admin-shelf-create -->
## Regal erstellen

1. **Standort** und **Ebene** (Stockwerk) wählen.
2. Optional einen **Regalnamen** und **Zusätzliche Hinweise** eintragen.
3. **Regal erstellen** klicken. Das System vergibt die Regal-ID (`S-‹Standort›-‹Stockwerk›-‹Nr›`).

Danach das Regal-Etikett drucken und am Regal anbringen.

---
<!-- end-feature -->

<!-- if-feature: printing -->
## Drucker

- **Druckwarteschlange:** Zeigt, ob der Drucker **Online** ist, wie viele Aufträge **Ausstehend** und **Fehlgeschlagen** sind und die **Letzten Fehler**. Erster Blick, wenn „nichts rauskommt“.
- **CUPS-Queues verwalten:** Drucker hinzufügen (**Queue hinzufügen** → **Scannen**), aktivieren, Aufträge abbrechen, Diagnose ansehen. Eine Schritt-für-Schritt-Anleitung steht auf der Seite [Drucker einrichten](/hilfe?doc=3_Drucker-Einrichtung).
- **Drucker-Einstellungen:** Pro Etikettentyp (Artikel-Etiketten, Box-Etiketten, Regal A4, Produktblatt A4 …) die passende Queue wählen, plus eine **Standard-Queue** als Rückfall.

---
<!-- end-feature -->

<!-- if-feature: agentic -->
## KI-Karten

- **KI-Warteschlange:** Wie viele Läufe **Wartend**, **Zu prüfen**, **Abgeschlossen** und **Fehlgeschlagen** sind. Mit **… Fehlgeschlagene neu starten** startest du alle fehlgeschlagenen Läufe neu.
- **Agentische Auto-Verteilung:** **Aktiviert** = sobald ein KI-Platz frei ist, wird automatisch ein noch nicht angereicherter Artikel gestartet. **Deaktiviert** = die KI läuft nur, wenn jemand sie startet.
- **Self-Heal Vorschau:** Zeigt, welche Artikel veraltet sind (z. B. weil sich die Regeln für Spezifikationen geändert haben) und was der Self-Heal mit ihnen machen würde. **Jetzt ausführen** startet den Durchlauf sofort.

Die gleichen Schalter und mehr findest du übersichtlicher im [KI-Cockpit](/hilfe?doc=10_KI-Cockpit).

---
<!-- end-feature -->

<!-- if-feature: admin-system-status -->
## Systemstatus

Eine Zeile pro Baustein: **API**, **Drucker**, **Medienspeicher** (Bilder, WebDAV), ERP und Shop. Steht irgendwo **Fehler** oder **WebDAV fehlt**, ist das der Ausgangspunkt für die [Fehlerbehebung](/hilfe?doc=2_Fehlerbehebung). Darunter stehen Kennzahlen wie Anzahl **Artikel**, **Behälter** und **Bilder**.

---
<!-- end-feature -->

<!-- if-feature: erp-sync -->
## Nächtliche ERP-Synchronisation

Ist sie **Aktiviert**, gleicht das System jede Nacht die Artikel mit dem ERP ab. **Deaktivieren**, wenn das ERP gewartet wird oder ein Fehler die Daten durcheinanderbringt — und danach nicht vergessen, wieder einzuschalten.

---
<!-- end-feature -->

<!-- if-feature: shopware -->
## Shopware-Verbindung

- **Status** und **Sync-Warteschlange** zeigen, ob der Shop erreichbar ist und wie viele Artikel auf die Übertragung warten.
- **Verbindung testen** prüft die Zugangsdaten.
- **Alle synchronisieren** reiht *alle* Shop-Artikel neu ein. Das dauert und ist nur für den Abgleich nach Störungen gedacht — für einzelne Artikel nimm **Shop Sync** in der Artikelliste.

---
<!-- end-feature -->

## Organisationen verwalten (Plattform-Admins)

Unter **Organisationen verwalten** legst du Organisationen an (Name, Kontakt-E-Mail für Bestellungen, Authentik-Gruppen für Benutzer und Admins) und ihre **Standorte** mit **Stockwerken**. Die Standort-ID steht später in jeder Regal-ID und lässt sich nicht mehr ändern — also gut überlegen.

<!-- if-feature: admin-taxonomy -->
## Taxonomie verwalten (Plattform-Admins)

Unter **Taxonomie verwalten** pflegst du Haupt- und Unterkategorien: Anzeigename, Code, Aliasse, ob die Kategorie **aktiv** ist und ob sie **im Intake-Menü** erscheint. Unter **Erweitert** liegen die Regeln für Qualität, Spezifikationen und Zerlegung.

> Änderungen an der Taxonomie wirken auf alle Artikel dieser Kategorie. Im Zweifel erst mit den Entwickler:innen absprechen.
<!-- end-feature -->
