# Ersatzteile erfassen (Zerlegen)

## Wie funktioniert das bei uns?

Manchmal landen Geräte bei uns, die sich nicht direkt als Ganzes verkaufen lassen — zu defekt, zu alt, oder es fehlen wichtige Teile. Statt sie einfach wegzuwerfen, zerlegen wir sie und verwerten die einzelnen Bauteile (RAM, SSD, Akku, Lüfter usw.) separat weiter.

Die zugehörigen Funktionen findest du unter **Zubehör → Komponenten**. Dabei musst du das Gerät nicht sofort physisch auseinanderbauen. Du kannst erst einmal im System festhalten, welche Teile vorhanden sind — und dafür vorgesehene Teile dann nach und nach erfassen und entnehmen.

Das Gerät bleibt dabei im System erhalten. Wenn du ein katalogisiertes Bauteil über die Zielauswahl in einen Behälter verschiebst, wird das Quellgerät als unvollständig mit Qualität **1 – Ersatzteil** markiert. Die Komponentenliste zeigt, welche katalogisierten Teile noch im Gerät und welche einem Behälter zugeordnet sind.

---

## Wann lohnt sich das Zerlegen?

- Das Gerät ist nicht mehr funktionstüchtig oder zu stark beschädigt für einen Direktverkauf.
- Einzelne Bauteile (z. B. ein RAM-Riegel, eine SSD) sind gut erhalten und haben eigenständigen Wert.
- Du willst das Gerät als Teilespender für Reparaturen nutzen.

Geräte, die sich noch verkaufen lassen — auch mit kleinen Mängeln — müssen nicht zerlegt werden. Die Qualitätsbewertung hilft dir dabei einzuschätzen, was sinnvoller ist.

---

## Schritt-für-Schritt: Bauteile erfassen und entnehmen

### 1. Qualitätsprüfung: Bauteile dokumentieren

Je nach Unterkategorie und verfügbarer Komponentenvorlage enthält die **Qualitätsbewertung** Fragen zu Bauteilen, zum Beispiel:

- Ist ein Lüfter vorhanden?
- Akkuzustand?
- Wie viel RAM ist verbaut?
- Wie viel Speicher (SSD/HDD)?
- usw.

Beantworte diese Fragen anhand der tatsächlichen Ausstattung. Die Vorlage bestimmt, welche Bauteilpositionen angezeigt werden; die Antworten liefern deren Angaben und Status. Nutze überprüfbare Informationen zum konkreten Gerät. Fragen, die du noch nicht beantworten kannst, dürfen offen bleiben.

---

### 2. Zubehör-Tab → Komponenten öffnen

Öffne den Artikel und wechsle auf den Tab **Zubehör**. Falls für die Unterkategorie eine Komponentenvorlage vorhanden ist, erscheint der Abschnitt **Komponenten**. Im vereinfachten Modus ist der Tab **Zubehör** ausgeblendet.

Jede Zeile steht für ein mögliches Bauteil. Das Symbol links zeigt den aktuellen Stand:

| Symbol | Bedeutung |
|--------|-----------|
| ⬜ | Unbekannt; noch keine passende Angabe oder Artikelverknüpfung |
| ◎ | Vorhanden, aber noch nicht als Artikel katalogisiert |
| ✕ | Bei der Qualitätsprüfung als fehlend markiert |
| ◉ | Erfasst — noch im Gerät |
| ○ | Entnommen — befindet sich in einem Behälter |

---

### 3. Bauteil katalogisieren (Erfassen)

Bei Positionen mit einem **Erfassen**-Knopf kannst du das Bauteil als eigenen Artikel katalogisieren:

1. Klick auf **Erfassen** in der entsprechenden Zeile. Falls eine passende Referenzverknüpfung bereits bekannt ist, wird sie direkt verwendet.
2. Andernfalls öffnet sich ein Fenster mit Referenzvorschlägen und einem Suchfeld. Wähle den passenden Vorschlag aus oder suche im Feld nach einer anderen Referenz.
3. Falls eine neue Referenz nötig ist, klick auf **+ Neu anlegen**, ergänze die Beschreibung und bestätige mit **Anlegen & katalogisieren**.
4. Nach erfolgreicher Erfassung zeigt die Position ◉ — das Bauteil ist als eigenständiger Artikel erfasst und liegt noch im Gerät.

> Ein **Erfassen**-Knopf kann auch bei einem zuvor als fehlend markierten Teil erscheinen. Prüfe die tatsächliche Ausstattung vor der Erfassung. Nicht jede Position unterstützt Artikelverknüpfungen: Beim Laptop bietet **SSD / HDD** derzeit Spezifikationsangaben, aber keinen **Erfassen**-Knopf.

---

### 4. Bauteil entnehmen (physisch ausbauen)

**Einlagern:** Das ausgebaute Bauteil wird einem Behälter zugeordnet.

1. Klick auf **Entnehmen** in der Zeile des katalogisierten Bauteils (◉).
2. Wähle im Umlagerungsdialog einen Zielbehälter: nach **Box-ID oder Name** suchen und den Treffer auswählen, eine bekannte Box-ID vollständig eingeben oder den Zielbehälter scannen.
3. Bestätige mit **Verschieben**. Alternativ erstellt **In neuen Behälter verschieben** einen neuen Zielbehälter.
4. Lege das Teil physisch in diesen Behälter. Die Komponentenposition zeigt anschließend ○. Ein hinterlegter Standort wird zusätzlich angezeigt.

Über diesen Umlagerungsablauf wird die Qualitätsbewertung des Quellgeräts auf **1 – Ersatzteil** gesetzt. Soll das Teil danach aus dem Lagerbestand ausgebucht werden, öffne seinen eigenen Artikel und verwende im Tab **Vorrat** die Bestandsaktion **Entnehmen** beziehungsweise bei Mengenartikeln **Menge reduzieren**.

---

### 5. Bauteil-Link entfernen (Rückgängig machen)

Falls du den falschen Artikel ausgewählt hast, solange das Bauteil noch **nicht entnommen** wurde:

- Klick auf **Lösen** und bestätige die Rückfrage.
- Die verknüpfte Bauteilinstanz und ihre Verknüpfung werden gelöscht.

> **Achtung:** Nach der Entnahme (Status ○) kann der Link nicht mehr entfernt werden. Das Bauteil muss dann wie ein normaler Artikel behandelt werden.

---

## Was passiert mit dem Quellgerät?

Das Quellgerät bleibt im System. Nach dem beschriebenen Verschieben eines katalogisierten Bauteils bekommt es Qualität **1 – Ersatzteil**. Im Tab **Zubehör** kannst du die Zuordnung der katalogisierten Teile prüfen.

So kannst du das Gerät auch als Teilespender für Reparaturen nutzen, ohne den Überblick zu verlieren.

---

## Beispiel: Laptop zerlegen

1. Gerät kommt rein: Laptop, defektes Display, sonst in Ordnung.
2. **Qualitätsprüfung ausfüllen:** RAM 16 GB, SSD 512 GB, kein Akku vorhanden.
3. **Tab Zubehör öffnen:** Im Bereich **Komponenten** findest du unter anderem **Arbeitsspeicher**, **SSD / HDD** und **Akku**.
4. **RAM katalogisieren:** Klick bei **Arbeitsspeicher** auf **Erfassen** und wähle, falls gefragt, eine Referenz aus → Status wechselt zu ◉.
5. **SSD / HDD prüfen:** Hier werden Spezifikationsangaben gepflegt; diese Position bietet derzeit keine Erfassung als Artikel an.
6. **Akku:** Steht auf ✕ (nicht vorhanden) — Slot bleibt leer.
7. **RAM entnehmen:** RAM ausbauen, **Entnehmen** → vorhandenen Zielbehälter wählen → **Verschieben** → RAM dort einlegen. Der Status wechselt zu ○.
8. Das Quellgerät erhält Qualität **1 – Ersatzteil**. Die SSD-Ausstattung ist als Angabe erfasst, der katalogisierte RAM dem gewählten Behälter zugeordnet.

Die Unterschiede zwischen Referenzdaten, einzelnen Exemplaren und Qualitätsantworten erklärt die Seite [Artikel](/hilfe?doc=6_Artikel).
