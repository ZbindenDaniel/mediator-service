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
| Puls-Symbol | Letzte Aktivitäten |
| Etiketten-Symbol | Unbearbeitete Kisten (Fundsachen) |
| Zahnrad-Symbol | Administration |
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

- **Suche:** Artikelnummer oder Beschreibung ins Suchfeld oben eingeben.
- **Filter:** In der Artikelliste kannst du nach Behälter, Qualität, Shop-Status und Platzierungsstatus filtern.
- **Direktnavigation:** Behälter-ID (z. B. `B-042`) direkt ins Suchfeld eingeben — springt sofort zur Behälterdetailansicht.

---

## 6. Artikel und Behälter umlagern

**Artikel in einen anderen Behälter:**
1. Artikel öffnen → Tab **Vorrat** → **Umlagern**.
2. Ziel-Behälter scannen oder ID eingeben.
3. Bestätigen.

**Behälter auf ein anderes Regal:**
1. Behälter öffnen → **Umlagern**.
2. Zielregal auswählen oder scannen.
3. Bestätigen.

Der neue Standort ist sofort in der Artikel- und Behälteransicht sichtbar.

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
7. **Einlagern:** Artikel in den richtigen Behälter legen → Tab **Vorrat** → **Umlagern**, Behälter-ID einscannen oder eingeben.

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
