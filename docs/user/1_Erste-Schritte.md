# Erste Schritte

Diese Seite erklärt die Grundfunktionen: Navigation, Artikel anlegen, suchen und umlagern.

## Benutzername und Einstellungen

Beim ersten Aufruf fragt das System nach deinem **Benutzernamen**. Er wird bei jeder Aktion gespeichert, damit nachvollziehbar ist, wer was geändert hat.

Klick oben rechts auf deinen Namen, um die Einstellungen zu öffnen. Dort kannst du:

- den Namen ändern,
- den **Einfachen Modus (weniger anzeigen)** einschalten: Es werden nur die Menüpunkte und Tabs zum Erfassen und Einlagern angezeigt,
- das Farbschema wählen (Hell/Dunkel),
- dich abmelden, wenn du mit einem Firmenkonto angemeldet bist.

Diese Einstellungen gelten nur für den Browser, in dem du sie setzt.

---

## Navigation

Die Navigation ist oben. Auf dem Handy öffnest du sie über das **#**-Symbol.

| Symbol | Funktion |
|--------|----------|
| **+** | Neuen Artikel erfassen |
| Listen-Symbol | Artikelliste |
| Karton-Symbol | Behälter und Regale |
<!-- if-feature: agentic -->
| Roboter-Symbol | KI-Cockpit: Übersicht und Einstellungen für alle KI-Läufe ([KI-Cockpit](/hilfe?doc=10_KI-Cockpit)) |
<!-- end-feature -->
<!-- if-feature: logs -->
| Log-Symbol | Protokoll aller Aktionen ([Aktivitäten](/hilfe?doc=9_Aktivitaeten)) |
<!-- end-feature -->
<!-- if-feature: stubs -->
| Geschenk-Symbol | Notizen zu noch nicht erfassten Sachen im Lager ([Fundsachen](/hilfe?doc=8_Fundsachen)) |
<!-- end-feature -->
| Werkzeug-Symbol | Administration, nur für Admins ([Administration](/hilfe?doc=7_Administration)) |
| Fragezeichen | Diese Hilfe |
<!-- if-feature: qr-scan -->
| Kamera-Symbol | QR-Code scannen |
<!-- end-feature -->
| Suchfeld | Artikel oder Behälter suchen |

---

## Tabs in der Detailansicht

Ein **Artikel** hat diese Tabs:

| Tab | Inhalt |
|-----|--------|
| **Vorrat** | Dieses Exemplar: Lagerort, Qualität, Preis, Seriennummer, Umlagern, Label drucken, Finden |
| **Referenz** | Gemeinsame Daten aller Exemplare: Beschreibung, Artikelnummer, Spezifikationen, Basispreis |
<!-- if-feature: agentic -->
| **KI** | KI-Lauf starten, Ergebnis prüfen, frühere Versionen |
<!-- end-feature -->
<!-- if-feature: item-images -->
| **Bilder** | Fotos hochladen oder mit der Kamera aufnehmen |
<!-- end-feature -->
<!-- if-feature: item-attachments -->
| **Anhänge** | Dateien, z. B. Löschprotokolle |
<!-- end-feature -->
| **Zubehör** | Verknüpftes Zubehör und Einzelteile (Zerlegen) |
<!-- if-feature: logs -->
| **Aktivitäten** | Alle Aktionen an diesem Artikel mit Person und Zeit |
<!-- end-feature -->
<!-- if-feature: item-marks -->
| **Markierung** | Artikel markieren und eine Notiz hinterlassen |
<!-- end-feature -->

Ein **Behälter** oder **Regal** hat diese Tabs:

| Tab | Inhalt |
|-----|--------|
| **Info** | Box-ID, Standort, Umlagern |
<!-- if-feature: box-notes -->
| **Notizen** | Freitext; bei Regalen auch Name und Farbe |
<!-- end-feature -->
<!-- if-feature: box-items -->
| **Artikel** | Inhalt des Behälters |
<!-- end-feature -->
<!-- if-feature: logs -->
| **Aktivitäten** | Alle Aktionen an diesem Behälter |
<!-- end-feature -->
<!-- if-feature: stubs -->
| **Fundsachen** | Nur bei Regalen: notierte, noch nicht erfasste Sachen |
<!-- end-feature -->

---

## Artikel anlegen

1. Klick auf **+**.
2. Gib die **Artikelnummer** ein (Pflichtfeld).
3. Wähle **Kategorie** und **Unterkategorie**.
4. Wähle die **Einheit**: **Stück** für Einzelgeräte mit Seriennummer, **Menge** für Massenware wie RAM, Netzteile oder Kabel.
5. Optional: Masse und Gewicht eintragen.
6. Klick auf **Weiter**. Die Qualitätsprüfung öffnet sich.
7. Beantworte die Fragen und bestätige.
8. Klick auf **Speichern**.

Der Artikel steht danach in der Artikelliste.
<!-- if-feature: printing -->
Drucke anschliessend das Label (Tab **Vorrat** → **Label drucken**).
<!-- end-feature -->

<!-- if-feature: item-images -->
**Fotos:** Tab **Bilder** → Datei hochladen. Auf Handy oder Tablet kannst du mit **Foto aufnehmen** direkt die Kamera verwenden.
<!-- end-feature -->

---

<!-- if-feature: qr-scan -->
## QR-Code scannen

1. Öffne die App auf dem Handy.
2. Tipp in der Navigation auf das **Kamera-Symbol**.
3. Halte die Kamera auf das QR-Label.
4. Der Artikel oder Behälter öffnet sich.

**Artikel im Lager suchen (Finden):** Artikel öffnen → Tab **Vorrat** → **Finden**. Scanne dann Labels im Lager. Beim gesuchten Artikel vibriert das Handy und es ertönt ein Ton.

> Finden funktioniert nur, wenn der Lagerort im System stimmt. Erfasse deshalb jede Umlagerung im System.

---
<!-- end-feature -->

## Artikel finden

### Welche Suche für welchen Zweck

| Wo | Was wird durchsucht | Bedienung |
|-----|------------------|-----------------|
| Suchfeld **Suchen…** oben | Artikel, Behälter und Regale | Begriff eingeben → Enter oder Lupe |
| Artikelliste, Feld **Suche** | Beschreibung, Nummer, Hersteller, Seriennummer, Spezifikationen und weitere Artikeldaten | Text eingeben → Enter |
| Behälterliste, Feld **Suche** | Box-ID, Behältername, Standort-ID, Regalname | Text eingeben; die Liste filtert beim Tippen |
| Dialog **Artikel umlagern**, Feld **Ziel wählen** | Box-ID oder Behältername | Mindestens zwei Zeichen eingeben → Treffer auswählen |

### Suchfeld oben

1. Begriff in **Suchen…** eingeben.
2. **Enter** drücken oder auf die **Lupe** klicken.
3. Treffer anklicken.

Bei Artikeln durchsucht das Feld: **Artikelnummer**, **Artikelbeschreibung**, **Suchbegriff**, **Kurzbeschreibung**, **Referenz-Spezifikationen**, **Hersteller**, **Seriennummer**, **MAC-Adresse**, **EAN**, **ItemUUID** und **Box-ID**. Die Spezifikationen des einzelnen Exemplars (Tab **Vorrat**) werden hier nicht durchsucht.

Bei Behältern und Regalen durchsucht es **Box-ID** und **Name**. Für Standort-ID oder Regalname nimm die **Behälterliste**.

Gross-/Kleinschreibung spielt keine Rolle. Mehrere Wörter werden einzeln gesucht, die Reihenfolge ist egal. Gibt es keinen genauen Treffer, zeigt die Suche ähnliche Artikel. Prüf vor dem Öffnen die Artikelnummer bzw. Box-ID.

> Das Suchfeld oben zeigt nur eine begrenzte Anzahl Treffer. Für längere Listen nimm die Artikel- oder Behälterliste.

### Direkt mit einer ID öffnen

Beginnt die Eingabe oben mit **I-**, **B-** oder **S-**, öffnet das System direkt den passenden Eintrag:

- **I-…** öffnet ein Exemplar, z. B. `I-000001-0001`.
- **B-…** öffnet einen Behälter, z. B. `B-281026-0001`.
- **S-…** öffnet ein Regal.

Die ID muss vollständig sein. Für Teile einer ID nimm die Behälterliste, die Zielsuche beim Umlagern oder das Feld **Suche** in der Artikelliste.

### Artikelliste filtern

1. Artikelliste öffnen (Listen-Symbol).
2. Im Feld **Suche** Begriff eingeben → **Enter**. Feld leeren zeigt wieder alle Artikel.
3. Weitere Filter: **Behälter**, **Unterkategorie**. Unter **Weitere Filter**: **Qualität**, **Ki-Status**, **Bilder**, **Preis** (Alle / Ohne Preis / Mit Preis) u. a.

Das Feld **Suche** findet Artikel, in denen jedes eingegebene Wort vorkommt, in beliebiger Reihenfolge. Akzente und Umlaute werden ignoriert. Beispiel: `7490 dell` findet ein Dell Latitude 7490. Durchsucht werden Beschreibung, Kurzbeschreibung, Hersteller, Artikelnummer, ItemUUID, Seriennummer, EAN, Suchbegriff, Langtext und die Spezifikationen des Exemplars. MAC-Adressen findest du nur über das Suchfeld oben.

Beim Sortieren nach **Preis** stehen Artikel ohne Preis am Ende. Filter und Sortierung verwenden den Basispreis.

Das Feld **Behälter** filtert nach Box-ID oder Standort, nicht nach Behältername. Der Filter gilt nach **Enter** oder beim Verlassen des Felds.

**Weniger Treffer als erwartet?** Prüf die gesetzten Filter. **Filter zurücksetzen** stellt alle Filter auf Standard. Artikel ohne Lagerbestand sind standardmässig ausgeblendet; mit der vollständigen ItemUUID findest du sie über das Suchfeld oben.

### Behälterliste

Das Suchfeld der **Behälterliste** findet Box-IDs, Behälter- und Regalnamen sowie Standort-IDs (auch wenn der Platzhalter nur **Box-ID suchen** sagt). Typ- und Standortfilter gelten zusätzlich.

<!-- if-feature: item-marks -->
### Markieren

Tab **Markierung** → **Merken**, optional mit Notiz. Markierungen und Notizen sind für alle sichtbar. In der Artikelliste filterst du mit **Markiert** danach.
<!-- end-feature -->

### Preise

- In der Referenz steht der **Basispreis**: der Preis eines neuwertigen Geräts.
- Der Preis eines Exemplars hängt vom Zustand ab: Zustand 5 = 100 %, 4 = 80 %, 3 = 60 %, 2 = 40 %, 1 oder unbekannt = 20 % des Basispreises, gerundet auf 5 Franken. Er steht im Tab **Vorrat**.
- Ausnahmen: **Instanz bearbeiten** → **Fixer Preis (CHF)**. Feld leeren setzt den Preis wieder nach Zustand.
<!-- if-feature: shopware -->
- **Mietware:** Schalter im Referenz-Formular. Der Artikel bekommt im Shop den Tag „rental“ und bleibt kaufbar.
- **Sofort in den Shop (nur Admins):** Dialog **Shopstatus setzen** → **Jetzt mit Shop synchronisieren**. Überträgt den gespeicherten Stand, ohne Felder zu ändern. Im Shop sichtbar nach etwa 10 Sekunden.
<!-- end-feature -->

Erklärung von Artikelnummer, ItemUUID und Spezifikationen: [Artikel](/hilfe?doc=6_Artikel).

---

## Artikel und Behälter umlagern

**Umlagern** speichert, wo ein Artikel oder Behälter liegt:

- **Artikel umlagern:** Der Artikel wird einem Behälter zugeordnet und übernimmt dessen Standort. Hat der Behälter keinen Standort, bleibt der Standort des Artikels leer.
- **Behälter umlagern:** Der Behälter wird einem Standort zugeordnet, z. B. einem Regal.

> Lege den Artikel oder Behälter auch wirklich an den gewählten Platz. Sonst stimmen System und Lager nicht überein.

### Artikel in einen vorhandenen Behälter

1. Artikel öffnen → Tab **Vorrat** → **Umlagern**.
2. Unter **Ziel wählen** Box-ID oder Behältername eingeben. Ab zwei Zeichen erscheinen Vorschläge.
3. Vorschlag auswählen. Die Box-ID steht danach im Feld.
4. Box-ID prüfen → **Verschieben**.
5. Der Dialog schliesst sich. Im Tab **Vorrat** steht unter **Behälter** die neue Box-ID.

**Beispiel:** Der Behälter **Kabelkiste** hat die ID `B-281026-0001`. Suche nach **Kabelkiste**, wähle den Treffer mit dieser ID und klick auf **Verschieben**.

> Wenn du nach dem Namen suchst, musst du einen Vorschlag auswählen. Nur den Namen einzutippen reicht nicht.

Du kannst auch eine vollständige Box-ID direkt eingeben.
<!-- if-feature: qr-scan -->
Oder: **Zielbehälter scannen** neben dem Suchfeld und das Label des Behälters scannen. Box-ID prüfen → **Verschieben**.
<!-- end-feature -->

### Artikel in einen neuen Behälter

1. Artikel öffnen → Tab **Vorrat** → **Umlagern**.
2. **In neuen Behälter verschieben** klicken. Das System legt einen Behälter mit neuer Box-ID an und ordnet den Artikel zu.
3. Unter **Behälter** den neuen Behälter öffnen.
4. Dort das Label drucken und den Behälter über **Umlagern** einem Standort zuordnen.

### Behälter auf ein anderes Regal

1. Behälter öffnen → **Umlagern**.
2. Unter **Neuer Ort** den Standort wählen.
3. **Verschieben** klicken und den angezeigten Standort prüfen.

<!-- if-feature: qr-scan -->
Oder: **Standort scannen** und das Label des Regals scannen. Ist der Dialog danach noch offen, mit **Verschieben** bestätigen.
<!-- end-feature -->

### Fehler korrigieren

Falsches Ziel gewählt: **Umlagern** erneut öffnen und an den richtigen Ort verschieben. Bei einer Fehlermeldung prüfen, ob die Ziel-ID stimmt und der Behälter existiert.

Jede Umlagerung wird mit deinem Benutzernamen gespeichert. Ist noch keiner gesetzt, fragt das System vor dem Verschieben danach.

<!-- if-feature: qr-scan -->
### Mehrere Artikel scannen (Handy)

1. Behälter öffnen → **Einscannen** → **▶ Scannen starten**.
2. Artikel nacheinander scannen. Nach jedem Scan kehrt die Ansicht zurück.
3. Liegt ein Artikel laut System woanders, wähle **Verschieben** oder **Überspringen**.
4. **Fertig** beendet den Scan.
5. Das System listet Artikel, die im Behälter sein sollten, aber nicht gescannt wurden. Wähle pro Artikel:
   - **Bestand entfernen**: Artikel ist nicht mehr vorhanden.
   - **Standort entfernen**: Artikel liegt woanders.

**Behälter auf ein Regal scannen:** Regal öffnen → **Behälter einlagern** → Behälter nacheinander scannen. Ablauf wie oben.
<!-- end-feature -->

<!-- if-feature: box-notes -->
**Regalfarbe:** Regal öffnen → Tab **Notizen** → **Regal-Details** → Farbe wählen. Die Farbe erscheint in der Behälterliste beim Regal.
<!-- end-feature -->

---

<!-- if-feature: stubs -->
## Fundsachen

Sachen ohne QR-Code, die noch nicht erfasst sind, notierst du als **Fundsache**: Geschenk-Symbol → **was gefunden?** → Regal-ID, Beschreibung und ungefähre Anzahl → **Speichern**. Details: [Fundsachen](/hilfe?doc=8_Fundsachen).

---
<!-- end-feature -->

<!-- if-feature: printing -->
## Labels drucken

- **Artikel:** Artikel öffnen → Tab **Vorrat** → **Label drucken** → Grösse wählen: **Gross**, **Klein** oder **A4 Produktblatt**.
- **Behälter:** Behälter öffnen → **Label drucken**.

Nach dem Drucken steht **Gesendet an Drucker**. Konnte nicht gedruckt werden, erscheint **Label als PDF öffnen**: Damit kannst du das Label über einen anderen Drucker ausdrucken. Weitere Hilfe: [Fehlerbehebung](/hilfe?doc=2_Fehlerbehebung).

---
<!-- end-feature -->

<!-- if-feature: agentic -->
## KI-Lauf

Ein KI-Lauf sucht im Web nach Informationen zum Gerät und schlägt Werte vor für: Beschreibung, Kurztext, Spezifikationen, Masse, Gewicht und Preis. Die Vorschläge werden erst nach deiner Prüfung übernommen.

1. Artikel öffnen → Tab **KI** → **Starten**. Der Lauf wartet in der Warteschlange, bis ein Platz frei ist.
2. Ist der Lauf fertig, erscheint **Review**. Das Review zeigt nacheinander: **Artikelbeschreibung → Kurztext → Spezifikationen → Dimensionen → Preis**. In jedem Schritt kannst du Werte korrigieren und im Feld **Feedback** notieren, was falsch war. **Zurück** / **Weiter** wechselt den Schritt.
3. Am Ende wählst du **Freigeben** oder **Ablehnen**.

| Entscheidung | Was passiert |
|---|---|
| **Freigeben** | Die Werte mit deinen Korrekturen werden gespeichert. |
| **Ablehnen** | Der Artikel wird für einen neuen Lauf vorgemerkt. Dein Feedback wird diesem Lauf als Anweisung mitgegeben. |

<!-- if-feature: shopware -->
Nach **Freigeben** fragt das System **Artikel in den Shop stellen?**
<!-- end-feature -->

Konkretes Feedback („Prozessor steht auf dem Typenschild: i5-8250U“) hilft dem nächsten Lauf mehr als allgemeines („falsch“). Wann der neue Lauf startet, steht im [KI-Cockpit](/hilfe?doc=10_KI-Cockpit).

Weitere Knöpfe im Tab **KI**:

| Knopf | Funktion |
|---|---|
| **Wiederholen** | Lauf neu starten, z. B. nach einem Fehler |
| **KI Überarbeitung** | Nur ausgewählte Felder neu erstellen, mit einer Anweisung (z. B. „ins Deutsche übersetzen“). Die übrigen Felder bleiben. |
| **Abbrechen** | Laufenden Lauf stoppen |
| **Abschliessen** | Lauf ohne Review als freigegeben markieren |

Darunter:

- **Gespeicherte Suchergebnisse:** Die Webseiten, die der Lauf verwendet hat. Unpassende Quellen kannst du entfernen.
- **Verlauf:** Frühere Versionen des Artikels mit den Unterschieden zur aktuellen. Eine frühere Version lässt sich **wiederherstellen**.

---
<!-- end-feature -->

<!-- if-feature: erp-sync -->
## ERP-Synchronisation

Sprich die ERP-Synchronisation vorher mit einer Admin-Person ab.

1. In der Artikelliste Artikel per Checkbox auswählen.
2. In der Aktionsleiste **Kivi Sync 🥝** klicken.
3. Dialog bestätigen.

---
<!-- end-feature -->

## Typische Abläufe

### Neues Gerät, Artikelnummer noch nicht im System

1. **Erfassen:** **+** → Artikelnummer (z. B. aufgedruckte Nummer oder interne Nummer), Kategorie und Einheit.
2. **Qualität bewerten:** direkt beim Anlegen oder später über Tab **Vorrat** → **Jetzt bewerten** (bzw. **Neu bewerten**). Die Antworten ergeben Qualitätsstufe und einen Teil der Spezifikationen.
<!-- if-feature: agentic -->
3. **KI-Lauf:** kann schon während der Bewertung starten. Status im Tab **KI**.
4. **Review:** Werte prüfen, korrigieren, **Freigeben** (siehe **KI-Lauf**).
<!-- end-feature -->
5. **Vollständigkeit prüfen:** Tab **Referenz** → Spezifikationen und Preis vorhanden? Fehlendes ergänzen.
<!-- if-feature: shopware -->
6. **Shop:** Beim Freigeben **Artikel in den Shop stellen?** bestätigen, wenn er verkauft werden soll.
<!-- end-feature -->
7. **Einlagern:** Artikel in den Behälter legen → Tab **Vorrat** → **Umlagern** → Behälter wählen → **Verschieben** (siehe **Artikel und Behälter umlagern**).

### Gerät mit bekannter Artikelnummer

1. **+** klicken.
2. Artikelnummer ins Feld **Artikelbeschreibung** eingeben → **Enter**.
3. Das System findet die Referenz und füllt Kategorie, Unterkategorie und Beschreibung aus.
4. Einheit bestätigen, Qualitätsprüfung ausfüllen, speichern.

---

## Weitere Hilfe

- Alle Hilfeseiten stehen in der Seitenleiste links.
- Probleme mit Drucker, Bildern, Speicher oder falschen Eingaben: [Fehlerbehebung](/hilfe?doc=2_Fehlerbehebung).
- Nicht gelöst: Screenshot machen, Artikelnummer notieren, Systemadministration kontaktieren.
