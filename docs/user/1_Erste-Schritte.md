# Erste Schritte

Willkommen! Diese Seite erklärt die wichtigsten Abläufe im System — vom ersten Artikel bis zur Einlagerung.

Beim ersten Aufruf wirst du nach deinem **Benutzernamen** gefragt. Damit kann man besser nachvollziehen, wer was macht. Du kannst ihn jederzeit ändern — einfach oben rechts im Header auf deinen Namen **klicken**. Dort findest du auch den einfachen Modus, das Farbschema (Hell/Dunkel) und, wenn du angemeldet bist, „Abmelden“.

**Einfacher Modus:** Im gleichen Dialog (Klick auf deinen Namen) kannst du **Einfacher Modus (weniger anzeigen)** einschalten. Dann siehst du nur die wichtigsten Menüpunkte und Tabs — praktisch, wenn du vor allem erfasst und einlagerst. Die Einstellung gilt nur für deinen Browser.

---

## Die Navigation auf einen Blick

Oben im Bildschirm findest du die Navigation (auf dem Handy hinter dem **#**-Symbol):

| Symbol | Was du dort findest |
|--------|---------------------|
| **+** | Neuen Artikel erfassen |
| Listen-Symbol | Alle Artikel |
| Karton-Symbol | Alle Behälter und Regale |
<!-- if-feature: agentic -->
| Roboter-Symbol | **KI-Cockpit** — die KI als Ganzes steuern (siehe Hilfeseite [KI-Cockpit](/hilfe?doc=10_KI-Cockpit)) |
<!-- end-feature -->
<!-- if-feature: logs -->
| Log-Symbol | Letzte Aktivitäten (siehe Hilfeseite [Aktivitäten](/hilfe?doc=9_Aktivitaeten)) |
<!-- end-feature -->
<!-- if-feature: stubs -->
| Geschenk-Symbol | **Fundsachen** — Sachen im Lager, die noch nicht erfasst sind (siehe Hilfeseite [Fundsachen](/hilfe?doc=8_Fundsachen)) |
<!-- end-feature -->
| Werkzeug-Symbol | Administration (nur für Admins, siehe Hilfeseite [Administration](/hilfe?doc=7_Administration)) |
| Fragezeichen | Diese Hilfeseite |
<!-- if-feature: qr-scan -->
| Kamera-Symbol | QR-Code scannen |
<!-- end-feature -->
| Suchfeld | Direkt nach Artikel, Behälter-ID oder Beschreibung suchen |

---

## Die Tabs in der Detailansicht

Wenn du einen **Artikel** öffnest, siehst du oben verschiedene Tabs:

| Tab | Was du dort findest |
|-----|---------------------|
| **Vorrat** | Lagerort, Qualität, Umlagern, Etikett drucken, Finden, Instanz bearbeiten (Seriennummer, Spezifikationen dieses Geräts) |
| **Referenz** | Grunddaten, Artikelnummer, Spezifikationen, Preis |
<!-- if-feature: agentic -->
| **KI** | KI-Anreicherung starten, Review, frühere Versionen |
<!-- end-feature -->
<!-- if-feature: item-images -->
| **Bilder** | Fotos hochladen, mit der Kamera aufnehmen, anzeigen |
<!-- end-feature -->
<!-- if-feature: item-attachments -->
| **Anhänge** | Dokumente und Dateien (z. B. Löschprotokolle) |
<!-- end-feature -->
| **Zubehör** | Verknüpfte Artikel, Ersatzteile (Zerlegen) |
<!-- if-feature: logs -->
| **Aktivitäten** | Was mit diesem Artikel passiert ist und wer es gemacht hat |
<!-- end-feature -->
<!-- if-feature: item-marks -->
| **Markierung** | Artikel für dich merken und eine Notiz hinterlassen |
<!-- end-feature -->

Ein **Behälter** oder **Regal** hat diese Tabs:

| Tab | Was du dort findest |
|-----|---------------------|
| **Info** | Box-ID, Standort, Umlagern |
<!-- if-feature: box-notes -->
| **Notizen** | Freitext zum Behälter; bei Regalen auch Name und Farbe |
<!-- end-feature -->
<!-- if-feature: box-items -->
| **Artikel** | Was im Behälter liegt |
<!-- end-feature -->
<!-- if-feature: logs -->
| **Aktivitäten** | Was mit dem Behälter passiert ist |
<!-- end-feature -->
<!-- if-feature: stubs -->
| **Fundsachen** | Nur bei Regalen: noch nicht erfasste Sachen auf diesem Regal |
<!-- end-feature -->

---

## Artikel anlegen

1. Klick auf das **+**-Symbol oben links.
2. Gib eine **Artikelnummer** ein (Pflichtfeld).
3. Wähle eine **Kategorie** und **Unterkategorie**.
4. Wähle die **Einheit**: **Stück** für Einzelgeräte (mit Seriennummer), **Menge** für Massenware (RAM, Netzteile, Kabel, ...).
5. Optional: Maße und Gewicht eintragen — das hilft bei der KI-Suche.
6. Klick auf **Weiter** — die Qualitätsprüfung öffnet sich.
7. Beantworte die Qualitätsfragen und bestätige.
8. Klick auf **Speichern**.

Der Artikel erscheint jetzt in der Artikelliste.
<!-- if-feature: printing -->
Du kannst direkt danach ein QR-Etikett drucken.
<!-- end-feature -->

<!-- if-feature: item-images -->
**Fotos:** Tab **Bilder** → Datei hochladen, oder auf dem Handy/Tablet **Foto aufnehmen** und direkt mit der Kamera fotografieren.
<!-- end-feature -->

---

<!-- if-feature: qr-scan -->
## QR-Code scannen

Mit dem Scan-Symbol navigierst du blitzschnell zu einem Artikel oder Behälter.

1. Öffne die App auf deinem Handy.
2. Tipp auf das **Scan**-Symbol in der Navigation.
3. Halte die Kamera auf das QR-Etikett.
4. Die Detailansicht öffnet sich automatisch.

**Artikel physisch suchen (Finden-Funktion):** Wenn du einen bestimmten Artikel im Lager suchen willst, öffne ihn in der Liste → Tab **Vorrat** → **Finden**. Dann scannst du QR-Codes im Lager, bis das Gerät vibriert und ein Ton ertönt — das bedeutet: gefunden!

> Damit die Suche zuverlässig funktioniert, muss der Lagerort immer aktuell sein. Halte die Standorte daher beim Umlagern immer aktuell und nutze die Inventur-Funktion, um Abweichungen zu finden.

---
<!-- end-feature -->

## Artikel finden

### Welche Suche passt zu deiner Aufgabe?

| Wo? | Was wird gesucht? | Wie startest du? |
|-----|------------------|-----------------|
| Suchfeld **Suchen…** oben | Artikel sowie Behälter und Regale | Begriff eingeben → Enter oder Lupe |
| Artikelliste, Feld **Suche** | Name, Nummer, Hersteller, Seriennummer, Spezifikationen und weitere Artikeldaten | Text eingeben → Enter |
| Behälterliste, Feld **Suche** | Box-ID, Behältername, Standort-ID oder Regalname | Text eingeben; die Liste wird beim Tippen gefiltert |
| Dialog **Artikel umlagern**, Feld **Ziel wählen** | Box-ID oder Behältername | Mindestens zwei Zeichen eingeben → Treffer auswählen |

### Oben nach einem Artikel oder Behälter suchen

1. Gib deinen Begriff in **Suchen…** ein.
2. Drück **Enter** oder klick auf die **Lupe**.
3. Klick in der Ergebnisliste auf den gewünschten Artikel oder Behälter, um ihn zu öffnen.

Bei Artikeln werden **Artikelnummer**, **Artikelbeschreibung**, der hinterlegte **Suchbegriff**, **Kurzbeschreibung**, **Referenz-Spezifikationen**, **Hersteller**, **Seriennummer**, **MAC-Adresse**, **EAN**, **ItemUUID** und **Box-ID** berücksichtigt. Die Spezifikationen des einzelnen Exemplars unter **Vorrat** werden hier nicht mit durchsucht.

Bei Behältern und Regalen werden **Box-ID** und **Name** durchsucht. Für eine Suche nach der Standort-ID oder dem zugehörigen Regalnamen benutze die **Behälterliste**.

**Beispiele:** Suche nach einer Artikelnummer wie `000001`, einem Hersteller oder einer bekannten Seriennummer. Einen benannten Behälter kannst du über seinen Namen suchen, zum Beispiel **Kabelkiste**.

Groß- und Kleinschreibung werden bei der Textsuche nicht unterschieden. Mehrere durch Leerzeichen getrennte Wörter werden einzeln berücksichtigt; ein Treffer muss daher nicht die gesamte Eingabe als zusammenhängenden Text enthalten. Gibt es keinen genauen Treffer, zeigt die Suche die ähnlichsten Artikel an — prüf dann genau, ob der richtige dabei ist. Prüfe die angezeigte Artikelnummer beziehungsweise Box-ID vor der Auswahl.

> Die obere Suche zeigt eine begrenzte Auswahl von Treffern. Benutze für die Arbeit mit einer längeren Liste die Artikel- oder Behälterliste und deren Filter.

### Mit einer vollständigen ID direkt öffnen

Wenn die Eingabe oben mit **I-**, **B-** oder **S-** beginnt, behandelt das System sie beim Absenden als direkte ID:

- **I-…:** öffnet die Artikelinstanz, zum Beispiel `I-000001-0001`.
- **B-…:** öffnet den Behälter, zum Beispiel `B-281026-0001`.
- **S-…:** öffnet das Regal.

Gib dafür die **vollständige ID** ein. Eine unvollständige ID mit einem dieser Präfixe öffnet keine Liste ähnlicher IDs. Teile einer Box-ID kannst du in der Behälterliste oder in der Zielsuche beim Umlagern suchen. Für Teile einer Artikelnummer eignet sich das Feld **Suche** in der Artikelliste.

### Die Artikelliste eingrenzen

1. Öffne die Artikelliste über das **Listen-Symbol**.
2. Gib im Feld **Suche** deinen Begriff ein und drück **Enter**. Leerst du das Feld, zeigt die Liste sofort wieder alles.
3. Ergänze bei Bedarf weitere Filter, zum Beispiel **Behälter** oder **Unterkategorie**. **Qualität**, **Ki-Status**, **Bilder**, **Preis** (Alle / Ohne Preis / Mit Preis) und weitere findest du unter **Weitere Filter**.

Das Feld **Suche** findet Artikel, bei denen jedes eingegebene Wort irgendwo vorkommt — in beliebiger Reihenfolge, Akzente und Umlaute spielen keine Rolle. `7490 dell` findet also auch einen Dell Latitude 7490. Durchsucht werden Beschreibung, Kurzbeschreibung, Hersteller, Artikelnummer, ItemUUID, Seriennummer, EAN, Suchbegriff, Langtext und die Spezifikationen des Exemplars. Eine MAC-Adresse suchst du über die **obere Suche**.

Beim Sortieren nach **Preis** stehen Artikel ohne Preis immer am Ende. Gefiltert und sortiert wird nach dem Basispreis.

Im separaten Feld **Behälter** kannst du eine Box-ID oder Standortangabe eingeben. Übernimm den Filter mit **Enter** oder indem du das Feld verlässt. Dieses Feld sucht nicht nach dem Behälternamen.

**Zu wenige Treffer?** Prüfe zusätzlich gesetzte Filter. Wenn **Filter zurücksetzen** angezeigt wird, kannst du damit die Listenfilter auf ihre Standardwerte zurückstellen. Artikel ohne Lagerbestand sind in der Standardliste ausgeblendet; eine bekannte vollständige ItemUUID kannst du weiterhin über die obere Suche öffnen.

### Behälter suchen und ein Umlagerungsziel wählen

In der **Behälterliste** findet das Suchfeld trotz des Platzhalters **Box-ID suchen** auch Behälter- und Regalnamen sowie Standort-IDs. Die übrigen Filter, etwa Typ und Standort, gelten zusätzlich.

Beim **Umlagern** kannst du nach **Box-ID oder Behältername** suchen. Wähle einen Vorschlag aus; erst dann wird dessen Box-ID als Ziel übernommen. Alternativ gibst du eine bekannte Box-ID vollständig ein. Den Ablauf erklärt der Abschnitt **Artikel und Behälter umlagern**.

<!-- if-feature: item-marks -->
**Markierte Artikel:** Im Tab **Markierung** auf **Merken** klicken (optional mit Notiz). Markierungen und Notizen sehen alle — so kannst du Kolleg:innen auf einen Artikel hinweisen.
<!-- end-feature -->

### Preise

- **Preise:** In der Referenz steht der **Basispreis** — der Preis eines neuwertigen Geräts. Jedes Exemplar kostet je nach Zustand einen Anteil davon (Zustand 5 = 100 %, 4 = 80 %, 3 = 60 %, 2 = 40 %, 1 oder unbekannt = 20 %, auf 5 Franken gerundet). Der Preis des Exemplars steht im Tab **Instanz**. Nur für Ausnahmen: unter **Instanz bearbeiten → Fixer Preis** einen eigenen Preis setzen (leer = wieder nach Zustand).
<!-- if-feature: shopware -->
- **Mietware:** Im Referenz-Formular den Schalter **Mietware** setzen — der Artikel bekommt im Shop den Tag „rental“ und bleibt trotzdem kaufbar.
- **Sofort in den Shop (Admins):** Im Dialog **Shopstatus setzen** eines Artikels überträgt **Jetzt mit Shop synchronisieren** den gespeicherten Stand an den Shop, ohne Felder zu ändern (nach etwa 10 Sekunden sichtbar).
<!-- end-feature -->

Zum Verständnis von Artikelnummer, ItemUUID und Spezifikationen siehe die Hilfeseite [Artikel](/hilfe?doc=6_Artikel).

---

## Artikel und Behälter umlagern

### Was macht Umlagern?

Mit **Umlagern** hältst du fest, wo ein Artikel oder Behälter im Lager liegt:

- **Artikel umlagern:** Der geöffnete Artikel wird dem gewählten Zielbehälter zugeordnet. Dabei übernimmt er dessen hinterlegten Standort. Hat der Zielbehälter noch keinen Standort, bleibt diese Angabe beim Artikel leer.
- **Behälter umlagern:** Du ordnest den Behälter einem neuen Standort, zum Beispiel einem Regal, zu.

> Lege den Artikel beziehungsweise Behälter auch tatsächlich an den gewählten Platz. Die Zuordnung im System und der physische Lagerort sollen übereinstimmen.

### Artikel in einen vorhandenen Behälter verschieben

1. Öffne den gewünschten Artikel und wechsle auf den Tab **Vorrat**.
2. Klick auf **Umlagern**. Der Dialog **Artikel umlagern** öffnet sich.
3. Gib unter **Ziel wählen** die **Box-ID** oder den **Namen des Behälters** ein. Ab zwei Zeichen erscheinen Suchvorschläge.
4. Wähle den passenden Treffer aus der Liste. Die Vorschläge zeigen die Box-ID und, falls vorhanden, den Behälternamen. Nach der Auswahl steht die Box-ID im Eingabefeld.
5. Prüfe die Ziel-ID und klick auf **Verschieben**.
6. Nach erfolgreichem Verschieben schließt sich der Dialog. Prüfe die neue Zuordnung unter **Behälter** im Tab **Vorrat**.

**Beispiel:** Dein Zielbehälter heißt **Kabelkiste** und hat die ID `B-281026-0001`. Suche nach **Kabelkiste**, wähle den Treffer mit der passenden ID und klick auf **Verschieben**.

<!-- if-feature: qr-scan -->
**Alternativ per QR-Code:** Klick neben dem Suchfeld auf **Zielbehälter scannen** und scanne das Etikett des Zielbehälters. Die Box-ID wird übernommen. Prüfe sie und bestätige mit **Verschieben**.
<!-- end-feature -->
Du kannst eine bekannte Box-ID auch direkt vollständig eingeben.

> Bei einer Suche nach dem Namen musst du einen Treffer auswählen. Der Name allein im Eingabefeld wählt noch keinen Zielbehälter aus.

### Artikel in einen neuen Behälter verschieben

1. Öffne den Artikel → Tab **Vorrat** → **Umlagern**.
2. Klick auf **In neuen Behälter verschieben**. Das System erstellt einen Behälter mit einer neuen Box-ID und ordnet den Artikel diesem Behälter zu.
3. Prüfe nach dem Schließen des Dialogs die neue Zuordnung unter **Behälter** und öffne den verlinkten Behälter.
4. Drucke dort bei Bedarf das Behälteretikett und ordne den neuen Behälter über **Umlagern** seinem Standort zu.

### Behälter auf ein anderes Regal verschieben

1. Öffne den Behälter und klick auf **Umlagern**.
2. Wähle im Feld **Neuer Ort** den gewünschten Standort aus.
3. Klick auf **Verschieben** und prüfe anschließend den angezeigten Standort des Behälters.

<!-- if-feature: qr-scan -->
**Alternativ per QR-Code:** Wähle **Standort scannen** und scanne das Etikett des Zielregals. Falls der Dialog anschließend noch geöffnet ist, bestätige mit **Verschieben**.
<!-- end-feature -->

### Ergebnis prüfen und Fehler korrigieren

Prüfe nach jeder Bewegung die Zuordnung beim Artikel beziehungsweise den Standort beim Behälter. Die Bewegung wird mit deinem Benutzernamen in den Aktivitäten protokolliert. Falls noch kein Benutzername gesetzt ist, wirst du vor dem Verschieben danach gefragt.

**Falsches Ziel gewählt?** Öffne **Umlagern** erneut und verschiebe den Artikel oder Behälter an den richtigen Ort. Bei einer Fehlermeldung prüfe zuerst die Ziel-ID und ob der Zielbehälter bereits existiert.

<!-- if-feature: qr-scan -->
**Viele Artikel auf einmal einscannen (Handy):** Behälter öffnen → **Einscannen** → **▶ Scannen starten**. Scanne einen Artikel nach dem anderen; nach jedem Scan kommst du automatisch zurück. Liegt ein Artikel laut System woanders, fragt das System **Verschieben** oder **Überspringen**. Mit **Fertig** beendest du die Runde. Artikel, die laut System im Behälter sein sollten, aber nicht gescannt wurden, werden dann aufgelistet — wähle für jeden **Bestand entfernen** (Artikel ist weg) oder **Standort entfernen** (Artikel ist woanders).

**Behälter auf ein Regal einlagern (Handy):** Regal öffnen → **Behälter einlagern** und die Behälter nacheinander scannen — gleicher Ablauf.
<!-- end-feature -->

<!-- if-feature: box-notes -->
**Regalfarbe:** Im Tab **Notizen** eines Regals kannst du unter **Regal-Details** eine Farbe wählen. Sie erscheint als Markierung in der Behälterliste, damit man Regale schneller wiederfindet.
<!-- end-feature -->

---

<!-- if-feature: stubs -->
## Fundsachen

Kisten und lose Sachen ohne QR-Code, die noch niemand erfasst hat, notierst du als **Fundsache**: Geschenk-Symbol → **was gefunden?** → Regal-ID, kurze Beschreibung und ungefähre Anzahl → **Speichern**. Erfasst wird später. Alles Weitere auf der Hilfeseite [Fundsachen](/hilfe?doc=8_Fundsachen).

---
<!-- end-feature -->

<!-- if-feature: printing -->
## Etiketten drucken

Jeder Artikel und jeder Behälter hat ein QR-Etikett.

- **Artikeletikett:** Artikel öffnen → Tab **Vorrat** → **Etikett drucken**.
- **Behälteretikett:** Behälter öffnen → **Etikett drucken**.

Bei Problemen → siehe **Fehlerbehebung** oder wende dich an die Person, die den Drucker verwaltet.

---
<!-- end-feature -->

<!-- if-feature: agentic -->
## KI-Unterstützung

Die KI sucht im Internet nach dem Gerät und füllt Beschreibung, Kurztext, Spezifikationen, Masse, Gewicht und einen Preisvorschlag aus.

1. Artikel öffnen → Tab **KI** → **Starten**. Der Lauf kommt in eine Warteschlange und startet, sobald ein Platz frei ist.
2. Ist die KI fertig, erscheint **Review**. Klick darauf — das Review führt dich Schritt für Schritt durch:
   **Artikelbeschreibung → Kurztext → Spezifikationen → Dimensionen → Preis**.
   In jedem Schritt kannst du die Werte **direkt korrigieren** und im Feld **Feedback** notieren, was falsch war. Mit **Zurück** / **Weiter** blätterst du.
3. Am Ende siehst du eine Zusammenfassung und entscheidest: **Freigeben** oder **Ablehnen**.
   - **Freigeben:** Deine Korrekturen werden gespeichert. Danach fragt das System **Artikel in den Shop stellen?**
   - **Ablehnen:** Deine Korrekturen und dein Feedback gehen an den nächsten KI-Lauf — die KI lernt daraus. Je genauer das Feedback, desto besser der nächste Versuch. Wie das automatisch passiert, steht auf der Hilfeseite [KI-Cockpit](/hilfe?doc=10_KI-Cockpit).

Weitere Knöpfe im Tab **KI**:

| Knopf | Wofür |
|---|---|
| **Wiederholen** | Lauf neu starten, z. B. nach einem Fehler |
| **KI Überarbeitung** | Nur einzelne Felder neu machen lassen, mit einer Anweisung (z. B. „ins Deutsche übersetzen") — alles andere bleibt |
| **Abbrechen** | Laufenden Lauf stoppen |
| **Abschliessen** | Lauf als erledigt markieren (Freigegeben) |

Unter den Knöpfen siehst du die **gespeicherten Suchergebnisse** (welche Webseiten die KI benutzt hat — schlechte kannst du entfernen) und den **Verlauf**: frühere Versionen des Artikels mit den Unterschieden zur aktuellen. Hat ein Lauf etwas verschlechtert, kannst du eine frühere Version **wiederherstellen**.

Nach der Freigabe ist der Artikel bereit für den Export.

---
<!-- end-feature -->

<!-- if-feature: erp-sync -->
## ERP-Synchronisation

Den ERP-Sync bitte nicht eigenständig ausführen — erst mit dem Admin absprechen. Wenn du zur Synchronisation berechtigt bist:

1. In der Artikelliste einen oder mehrere Artikel per Checkbox auswählen.
2. In der Aktionsleiste auf **Kivi Sync 🥝** klicken.
3. Dialog bestätigen.

---
<!-- end-feature -->

## Abläufe im Überblick

### Neues Gerät ohne Artikelnummer

Ein Gerät kommt rein, das noch nicht im System ist:

1. **Erfassen:** Klick auf **+**, Artikelnummer eingeben (z. B. die aufgedruckte Seriennummer oder eine interne Nummer), Kategorie und Einheit wählen.
2. **Qualität bewerten:** Direkt im nächsten Schritt oder später über Tab **Vorrat** → **Qualität bewerten**. Die Antworten bestimmen Qualitätsstufe und Spezifikationen.
<!-- if-feature: agentic -->
3. **KI läuft gleichzeitig:** Während du bewertest, kann die KI bereits im Hintergrund starten. Im Tab **KI** siehst du den Fortschritt.
4. **Review:** Wenn die KI fertig ist, erscheint **Review**. Schritte durchgehen, Fehler direkt korrigieren, am Ende **Freigeben** (siehe **KI-Unterstützung**).
<!-- end-feature -->
5. **Alle Infos vollständig?** Im Tab **Referenz** prüfen, ob Spezifikationen und Preis eingetragen sind. Fehlende Felder ergänzen.
<!-- if-feature: shopware -->
6. **Shop:** Beim Freigeben **Artikel in den Shop stellen?** bestätigen, wenn er verkauft werden soll.
<!-- end-feature -->
7. **Einlagern:** Artikel in den richtigen Behälter legen → Tab **Vorrat** → **Umlagern**, Zielbehälter per Box-ID oder Name suchen und auswählen → **Verschieben**. Details findest du unter **Artikel und Behälter umlagern**.

---

### Gerät mit bekannter Artikelnummer

Wenn das Gerät eine bekannte Artikelnummer hat, die bereits im System existiert:

1. Klick auf **+**.
2. Tippe die Artikelnummer ins Feld **Artikelbeschreibung** und drück Enter.
3. Das System findet die vorhandene Referenz und befüllt Kategorie, Unterkategorie und Beschreibung automatisch.
4. Nur noch Einheit bestätigen, Qualitätsprüfung ausfüllen und speichern.

---

## Hilfe und Support

Bei Fragen schau hier in der Hilfe nach — alle Themen findest du in der Seitenleiste.

Für häufige Probleme (Drucker, Bilder, WebDAV, versehentliche Fehler) → **Fehlerbehebung**.

Wenn du etwas nicht lösen kannst: Screenshot machen, Artikelnummer notieren, Systemadministration kontaktieren.
