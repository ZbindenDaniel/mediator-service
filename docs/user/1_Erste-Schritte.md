# Erste Schritte

Willkommen! Diese Seite erklärt die wichtigsten Abläufe im System — vom ersten Artikel bis zur Einlagerung.

Beim ersten Aufruf wirst du nach deinem **Benutzernamen** gefragt. Damit kann man besser nachvollziehen, wer was macht. Du kannst ihn jederzeit ändern — einfach auf deinen Namen oben rechts im Header **doppelklicken**.

---

## 1. Die Navigation auf einen Blick

Oben im Bildschirm findest du die Navigation:

| Symbol | Was du dort findest |
|--------|---------------------|
| **+** | Neuen Artikel erfassen |
| Listen-Symbol | Alle Artikel |
| Karton-Symbol | Alle Behälter und Regale |
| Log-Symbol | Letzte Aktivitäten |
| Geschenck-Symbol | Unbearbeitete Kisten (Fundsachen) |
| Schlüssel-Symbol | Administration |
| Fragezeichen | Diese Hilfeseite |
| Suchfeld | Direkt nach Artikel, Behälter-ID oder Beschreibung suchen |

---

## 2. Die Tabs in der Artikeldetailansicht

Wenn du einen Artikel öffnest, siehst du oben verschiedene Tabs:

| Tab | Was du dort findest |
|-----|---------------------|
| **Vorrat** | Lagerort, Qualität, Umlagern, Etikett drucken, Finden |
| **Referenz** | Grunddaten, Artikelnummer, Spezifikationen, Preis |
| **KI** | KI-Anreicherung starten und reviewen |
| **Bilder** | Fotos hochladen und anzeigen |
| **Anhänge** | Dokumente und Dateien |
| **Zubehör** | Verknüpfte Artikel, Ersatzteile (Zerlegen) |

---

## 3. Artikel anlegen

1. Klick auf das **+**-Symbol oben links.
2. Gib eine **Artikelnummer** ein (Pflichtfeld).
3. Wähle eine **Kategorie** und **Unterkategorie**.
4. Wähle die **Einheit**: **Stück** für Einzelgeräte (mit Seriennummer), **Menge** für Massenware (RAM, Netzteile, Kabel, ...).
5. Optional: Maße und Gewicht eintragen — das hilft bei der KI-Suche.
6. Klick auf **Weiter** — die Qualitätsprüfung öffnet sich.
7. Beantworte die Qualitätsfragen und bestätige.
8. Klick auf **Speichern**.

Der Artikel erscheint jetzt in der Artikelliste. Du kannst direkt danach ein QR-Etikett drucken.

---

## 4. QR-Code scannen

Mit dem Scan-Symbol navigierst du blitzschnell zu einem Artikel oder Behälter.

1. Öffne die App auf deinem Handy.
2. Tipp auf das **Scan**-Symbol in der Navigation.
3. Halte die Kamera auf das QR-Etikett.
4. Die Detailansicht öffnet sich automatisch.

**Artikel physisch suchen (Finden-Funktion):** Wenn du einen bestimmten Artikel im Lager suchen willst, öffne ihn in der Liste → Tab **Vorrat** → **Finden**. Dann scannst du QR-Codes im Lager, bis das Gerät vibriert und ein Ton ertönt — das bedeutet: gefunden!

> Damit die Suche zuverlässig funktioniert, muss der Lagerort immer aktuell sein. Halte die Standorte daher beim Umlagern immer aktuell und nutze die Inventur-Funktion, um Abweichungen zu finden.

---

## 5. Artikel finden

### Welche Suche passt zu deiner Aufgabe?

| Wo? | Was wird gesucht? | Wie startest du? |
|-----|------------------|-----------------|
| Suchfeld **Suchen…** oben | Artikel sowie Behälter und Regale | Begriff eingeben → Enter oder Lupe |
| Artikelliste, Feld **Artikelname** | Artikelbeschreibung oder Artikelnummer | Text eingeben → Enter |
| Behälterliste, Feld **Suche** | Box-ID, Behältername, Standort-ID oder Regalname | Text eingeben; die Liste wird beim Tippen gefiltert |
| Dialog **Artikel umlagern**, Feld **Ziel wählen** | Box-ID oder Behältername | Mindestens zwei Zeichen eingeben → Treffer auswählen |

### Oben nach einem Artikel oder Behälter suchen

1. Gib deinen Begriff in **Suchen…** ein.
2. Drück **Enter** oder klick auf die **Lupe**.
3. Klick in der Ergebnisliste auf den gewünschten Artikel oder Behälter, um ihn zu öffnen.

Bei Artikeln werden **Artikelnummer**, **Artikelbeschreibung**, der hinterlegte **Suchbegriff**, **Kurzbeschreibung**, **Referenz-Spezifikationen**, **Hersteller**, **Seriennummer**, **MAC-Adresse**, **EAN**, **ItemUUID** und **Box-ID** berücksichtigt. Die Spezifikationen des einzelnen Exemplars unter **Vorrat** werden hier nicht mit durchsucht.

Bei Behältern und Regalen werden **Box-ID** und **Name** durchsucht. Für eine Suche nach der Standort-ID oder dem zugehörigen Regalnamen benutze die **Behälterliste**.

**Beispiele:** Suche nach einer Artikelnummer wie `000001`, einem Hersteller oder einer bekannten Seriennummer. Einen benannten Behälter kannst du über seinen Namen suchen, zum Beispiel **Kabelkiste**.

Groß- und Kleinschreibung werden bei der Textsuche nicht unterschieden. Mehrere durch Leerzeichen getrennte Wörter werden einzeln berücksichtigt; ein Treffer muss daher nicht die gesamte Eingabe als zusammenhängenden Text enthalten. Prüfe die angezeigte Artikelnummer beziehungsweise Box-ID vor der Auswahl.

> Die obere Suche zeigt eine begrenzte Auswahl von Treffern. Benutze für die Arbeit mit einer längeren Liste die Artikel- oder Behälterliste und deren Filter.

### Mit einer vollständigen ID direkt öffnen

Wenn die Eingabe oben mit **I-**, **B-** oder **S-** beginnt, behandelt das System sie beim Absenden als direkte ID:

- **I-…:** öffnet die Artikelinstanz, zum Beispiel `I-000001-0001`.
- **B-…:** öffnet den Behälter, zum Beispiel `B-281026-0001`.
- **S-…:** öffnet das Regal.

Gib dafür die **vollständige ID** ein. Eine unvollständige ID mit einem dieser Präfixe öffnet keine Liste ähnlicher IDs. Teile einer Box-ID kannst du in der Behälterliste oder in der Zielsuche beim Umlagern suchen. Für Teile einer Artikelnummer eignet sich das Feld **Artikelname** in der Artikelliste.

### Die Artikelliste eingrenzen

1. Öffne die Artikelliste über das **Listen-Symbol**.
2. Gib im Feld **Artikelname** eine Beschreibung oder Artikelnummer ein und drück **Enter**.
3. Ergänze bei Bedarf weitere Filter, zum Beispiel **Behälter**, **Unterkategorie**, **Qualität**, **Ki-Status**, Bilder oder Preis.

Das Feld **Artikelname** sucht einen zusammenhängenden Textteil in Beschreibung oder Artikelnummer. Seriennummer, MAC-Adresse und EAN suchst du über die **obere Suche**.

Im separaten Feld **Behälter** kannst du eine Box-ID oder Standortangabe eingeben. Übernimm den Filter mit **Enter** oder indem du das Feld verlässt. Dieses Feld sucht nicht nach dem Behälternamen.

**Zu wenige Treffer?** Prüfe zusätzlich gesetzte Filter. Wenn **Filter zurücksetzen** angezeigt wird, kannst du damit die Listenfilter auf ihre Standardwerte zurückstellen. Artikel ohne Lagerbestand sind in der Standardliste ausgeblendet; eine bekannte vollständige ItemUUID kannst du weiterhin über die obere Suche öffnen.

### Behälter suchen und ein Umlagerungsziel wählen

In der **Behälterliste** findet das Suchfeld trotz des Platzhalters **Box-ID suchen** auch Behälter- und Regalnamen sowie Standort-IDs. Die übrigen Filter, etwa Typ und Standort, gelten zusätzlich.

Beim **Umlagern** kannst du nach **Box-ID oder Behältername** suchen. Wähle einen Vorschlag aus; erst dann wird dessen Box-ID als Ziel übernommen. Alternativ gibst du eine bekannte Box-ID vollständig ein oder scannst den Zielbehälter. Den Ablauf erklärt Abschnitt 6.

Zum Verständnis von Artikelnummer, ItemUUID und Spezifikationen siehe die Hilfeseite [Artikel](/hilfe?doc=6_Artikel).

---

## 6. Artikel und Behälter umlagern

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

**Alternativ per QR-Code:** Klick neben dem Suchfeld auf **Zielbehälter scannen** und scanne das Etikett des Zielbehälters. Die Box-ID wird übernommen. Prüfe sie und bestätige mit **Verschieben**. Du kannst eine bekannte Box-ID auch direkt vollständig eingeben.

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

**Alternativ per QR-Code:** Wähle **Standort scannen** und scanne das Etikett des Zielregals. Falls der Dialog anschließend noch geöffnet ist, bestätige mit **Verschieben**.

### Ergebnis prüfen und Fehler korrigieren

Prüfe nach jeder Bewegung die Zuordnung beim Artikel beziehungsweise den Standort beim Behälter. Die Bewegung wird mit deinem Benutzernamen in den Aktivitäten protokolliert. Falls noch kein Benutzername gesetzt ist, wirst du vor dem Verschieben danach gefragt.

**Falsches Ziel gewählt?** Öffne **Umlagern** erneut und verschiebe den Artikel oder Behälter an den richtigen Ort. Bei einer Fehlermeldung prüfe zuerst die Ziel-ID und ob der Zielbehälter bereits existiert.

---

## 7. Etiketten drucken

Jeder Artikel und jeder Behälter hat ein QR-Etikett.

- **Artikeletikett:** Artikel öffnen → Tab **Vorrat** → **Etikett drucken**.
- **Behälteretikett:** Behälter öffnen → **Etikett drucken**.

Bei Problemen → siehe **Fehlerbehebung** oder wende dich an die Person, die den Drucker verwaltet.

---

## 8. KI-Unterstützung

Die KI kann Spezifikationen, Kategorien und Preisvorschläge automatisch ermitteln.

1. Artikel öffnen → Tab **KI**.
2. Klick auf **KI-Anreicherung starten**.
3. Die KI durchläuft Extraktion → Kategorisierung → Preisermittlung.
4. Sobald **Review erforderlich** erscheint, klick auf **Review durchführen**.
5. Vorschläge prüfen — bestätigen oder korrigieren.
6. Klick auf **Abschließen**.

Nach der Freigabe ist der Artikel bereit für den ERP-Export.

---

## 9. ERP-Synchronisation

Den ERP-Sync bitte nicht eigenständig ausführen — erst mit dem Admin absprechen. Wenn du zur Synchronisation berechtigt bist:

1. In der Artikelliste einen oder mehrere Artikel per Checkbox auswählen.
2. In der Aktionsleiste auf **ERP-Sync** klicken.
3. Dialog bestätigen.

---

## 10. Abläufe im Überblick

### Neues Gerät ohne Artikelnummer

Ein Gerät kommt rein, das noch nicht im System ist:

1. **Erfassen:** Klick auf **+**, Artikelnummer eingeben (z. B. die aufgedruckte Seriennummer oder eine interne Nummer), Kategorie und Einheit wählen.
2. **Qualität bewerten:** Direkt im nächsten Schritt oder später über Tab **Vorrat** → **Qualität bewerten**. Die Antworten bestimmen Qualitätsstufe und Spezifikationen.
3. **KI läuft gleichzeitig:** Während du bewertest, kann die KI bereits im Hintergrund starten. Im Tab **KI** siehst du den Fortschritt.
4. **Review:** Wenn die KI fertig ist, erscheint **Review erforderlich**. Kurz die Vorschläge prüfen und bestätigen.
5. **Alle Infos vollständig?** Im Tab **Referenz** prüfen, ob Spezifikationen und Preis eingetragen sind. Fehlende Felder ergänzen.
6. **Bereit für den Shop markieren:** Nach dem Review ist der Artikel als freigegeben markiert.
7. **Einlagern:** Artikel in den richtigen Behälter legen → Tab **Vorrat** → **Umlagern**, Zielbehälter per Box-ID oder Name suchen und auswählen oder den QR-Code scannen → **Verschieben**. Details findest du in Abschnitt 6.

---

### Gerät mit bekannter Artikelnummer

Wenn das Gerät eine bekannte Artikelnummer hat, die bereits im System existiert:

1. Klick auf **+**.
2. Tippe die Artikelnummer ins Feld **Artikelbeschreibung** und drück Enter.
3. Das System findet die vorhandene Referenz und befüllt Kategorie, Unterkategorie und Beschreibung automatisch.
4. Nur noch Einheit bestätigen, Qualitätsprüfung ausfüllen und speichern.

---

## 11. Hilfe und Support

Bei Fragen schau hier in der Hilfe nach — alle Themen findest du in der Seitenleiste.

Für häufige Probleme (Drucker, Bilder, WebDAV, versehentliche Fehler) → **Fehlerbehebung**.

Wenn du etwas nicht lösen kannst: Screenshot machen, Artikelnummer notieren, Systemadministration kontaktieren.
