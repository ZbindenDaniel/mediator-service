# Erste Schritte

Willkommen im Lagerverwaltungssystem! Hier erfasst du Artikel, lagerst sie, findest sie wieder und überträgst sie ins ERP. Diese Seite zeigt dir die wichtigsten Schritte — lass uns starten.

---

## 1. Zugang und Browser

Öffne die App in einem aktuellen Browser — Chrome oder Firefox empfohlen. Die App läuft auf Desktop und Mobilgerät. Für QR-Scanning brauchst du ein Handy mit Kamera.

Beim ersten Aufruf fragt die App nach deinem **Benutzernamen**. Der Name erscheint in der Aktivitätshistorie, damit man sieht, wer was gemacht hat. Du kannst ihn jederzeit ändern — einfach auf deinen Namen oben rechts im Header **doppelklicken**.

---

## 2. Die Navigation auf einen Blick

Oben im Bildschirm findest du die Navigation:

| Symbol | Was du dort findest |
|--------|---------------------|
| **+** | Neuen Artikel erfassen |
| Listen-Symbol | Alle Artikel |
| Karton-Symbol | Alle Behälter und Regale |
| Puls-Symbol | Letzte Aktivitäten |
| Etiketten-Symbol | Unbearbeitete Lieferungen (Stubs) |
| Zahnrad-Symbol | Administration |
| Fragezeichen | Diese Hilfeseite |
| Suchfeld | Direkt nach Artikel, Behälter-ID oder Beschreibung suchen |

---

## 3. Die Tabs in der Artikeldetailansicht

Wenn du einen Artikel öffnest, siehst du oben verschiedene Tabs:

| Tab | Was du dort findest |
|-----|---------------------|
| **Referenz** | Grunddaten, Artikelnummer, Spezifikationen, Preis |
| **Vorrat** | Lagerort, Qualität, Umlagern, Etikett drucken, Finden |
| **KI** | KI-Anreicherung starten und reviewen |
| **Bilder** | Fotos hochladen und anzeigen |
| **Anhänge** | Dokumente und Dateien |
| **Zubehör** | Verknüpfte Artikel, Ersatzteile (Zerlegen) |

---

## 4. Artikel anlegen

1. Klick auf das **+**-Symbol oben links.
2. Gib eine **Artikelnummer** ein (Pflichtfeld).
3. Wähle eine **Kategorie** und **Unterkategorie**.
4. Wähle die **Einheit**: **Stück** für Einzelgeräte (mit Seriennummer), **Menge** für Massenware.
5. Optional: Maße und Gewicht eintragen.
6. Klick auf **Weiter** — die Qualitätsprüfung öffnet sich.
7. Beantworte die Qualitätsfragen und bestätige.
8. Klick auf **Speichern**.

Der Artikel erscheint jetzt in der Artikelliste. Du kannst direkt danach ein QR-Etikett drucken.

---

## 5. QR-Code scannen

Mit dem Scan-Symbol navigierst du blitzschnell zu einem Artikel oder Behälter, ohne suchen zu müssen.

1. Öffne die App auf deinem Handy.
2. Tipp auf das **Scan**-Symbol in der Navigation.
3. Halte die Kamera auf das QR-Etikett.
4. Die Detailansicht öffnet sich automatisch.

**Artikel physisch suchen (Finden-Funktion):** Wenn du einen bestimmten Artikel im Lager suchen willst, öffne ihn in der Liste → Tab **Vorrat** → **Finden**. Dann scannst du QR-Codes im Lager, bis das Gerät vibriert und ein Ton ertönt — das bedeutet: gefunden!

---

## 6. Artikel finden

- **Suche:** Artikelnummer oder Beschreibung ins Suchfeld oben eingeben.
- **Filter:** In der Artikelliste kannst du nach Behälter, Qualität, Shop-Status und Platzierungsstatus filtern.
- **Direktnavigation:** Behälter-ID (z. B. `B-042`) direkt ins Suchfeld eingeben — springt sofort zur Behälterdetailansicht.

---

## 7. Artikel und Behälter umlagern

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

## 8. Etiketten drucken

Jeder Artikel und jeder Behälter hat ein QR-Etikett.

- **Artikeletikett:** Artikel öffnen → Tab **Vorrat** → **Etikett drucken**.
- **Behälteretikett:** Behälter öffnen → **Etikett drucken**.

Achte darauf, dass der Drucker eingeschaltet und verbunden ist. Bei Problemen → siehe **Fehlerbehebung** oder wende dich an die Person, die den Drucker verwaltet.

---

## 9. KI-Unterstützung

Die KI kann Spezifikationen, Kategorien und Preisvorschläge automatisch ermitteln.

1. Artikel öffnen → Tab **KI**.
2. Klick auf **KI-Anreicherung starten**.
3. Die KI durchläuft die Phasen Extraktion → Kategorisierung → Preisermittlung.
4. Sobald **Überprüfung erforderlich** erscheint, klick auf **Review durchführen**.
5. Vorschläge prüfen — bestätigen oder korrigieren.
6. Klick auf **Abschließen**.

Nach der Freigabe ist der Artikel bereit für den ERP-Export.

---

## 10. ERP-Synchronisation

Freigegebene Artikel ins ERP übertragen:

1. In der Artikelliste einen oder mehrere Artikel per Checkbox auswählen.
2. In der Aktionsleiste auf **ERP-Sync** klicken.
3. Dialog bestätigen.

Eine Erfolgsmeldung bestätigt die Übertragung. Bei Fehlern → bitte die Systemadministration kontaktieren.

---

## 11. Dein Alltag mit dem System

So läuft ein typischer Tag ab:

1. **Neue Lieferung eingetroffen?** Öffne die App und scanne die Etiketten der Geräte — oder erfasse sie manuell mit dem **+**-Symbol.
2. **Qualität einschätzen:** Beantworte die Qualitätsfragen direkt beim Erfassen oder später über Tab **Vorrat** → **Qualität bewerten**.
3. **KI laufen lassen:** Tab **KI** → **KI-Anreicherung starten**. Die KI erledigt Recherche, Kategorisierung und Preisfindung.
4. **Reviewen und freigeben:** Wenn die KI fertig ist, kurz die Vorschläge prüfen und bestätigen.
5. **ERP-Export:** Freigegebene Artikel auswählen und mit **ERP-Sync** übertragen.
6. **Einlagern:** Artikel in den richtigen Behälter legen und ggf. umlagern — der Standort ist immer aktuell im System sichtbar.

---

## 12. Hilfe und Support

Bei Fragen zur Bedienung schau hier in der Hilfe nach — alle Themen findest du in der Seitenleiste links.

Bei häufigen Problemen (Drucker, Bilder, WebDAV, versehentliche Fehler) findest du Schritt-für-Schritt-Hilfe unter **Fehlerbehebung**.

Wenn du etwas nicht lösen kannst: mach einen Screenshot, notiere die Artikelnummer und wende dich an die Systemadministration.
