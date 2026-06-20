# Freigabe-Checkliste

Mit dieser Checkliste prüfst du vor einer neuen Softwareversion, ob alle wichtigen Funktionen korrekt arbeiten. Hak jeden Punkt ab, sobald er erfolgreich geprüft wurde.

---

**Tester:** ____________________________

**Datum:** ____________________________

**Version / Release:** ____________________________

---

## 1. Artikel erfassen

- [ ] Öffne die App und klick oben links auf das **+**-Symbol.
- [ ] Füll die Pflichtfelder aus: Artikelnummer, Kategorie, Unterkategorie und Einheit (Stück oder Menge).
- [ ] Gib optional Maße (Länge, Breite, Höhe) und Gewicht ein.
- [ ] Klick auf **Weiter** und schließe die Qualitätsprüfung ab.
- [ ] Klick auf **Speichern**.

**Erwartetes Ergebnis:** Der neue Artikel erscheint in der Artikelliste mit der eingegebenen Artikelnummer.

---

## 2. Qualitätsprüfung durchführen

- [ ] Öffne einen neu erfassten Artikel über die Artikelliste.
- [ ] Wechsle zum Tab **Vorrat**.
- [ ] Klick auf **Qualität bewerten** (sofern noch keine Bewertung vorliegt).
- [ ] Beantworte alle Fragen im Qualitätsfragebogen (z. B. Tastaturzustand, RAM, Akku bei Laptops).
- [ ] Bestätige die Bewertung.

**Erwartetes Ergebnis:** Im Tab **Vorrat** ist eine Qualitätsnote (1–5) gespeichert. Im Tab **Referenz** sind die ermittelten Spezifikationsfelder (z. B. RAM, SSD) sichtbar.

---

## 3. Spezifikationsfelder prüfen

- [ ] Öffne einen Artikel, dessen Unterkategorie einen Spezifikationsvertrag hat (z. B. Laptop).
- [ ] Wechsle zum Tab **Referenz**.
- [ ] Blätter zur Tabelle **Spezifikationen** (Langtext-Felder).

**Erwartetes Ergebnis:** Die für diese Unterkategorie vorgeschriebenen Felder (z. B. „RAM", „Festplatte", „Betriebssystem") sind sichtbar — auch wenn sie noch leer sind. Leere Felder zeigen an, dass sie noch befüllt werden müssen.

---

## 4. KI-Anreicherung starten und prüfen

- [ ] Öffne einen Artikel mit unvollständigen Spezifikationen.
- [ ] Wechsle zum Tab **KI**.
- [ ] Klick auf **KI-Anreicherung starten**.
- [ ] Warte, bis der Lauf die Phasen Extraktion → Kategorisierung → Preisermittlung durchläuft.
- [ ] Sobald **Überprüfung erforderlich** erscheint, klick auf **Review durchführen**.
- [ ] Prüfe die vorgeschlagenen Spezifikationsfelder: Bestätige korrekte Angaben, entferne falsche.
- [ ] Bestätige den vorgeschlagenen Preis oder gib einen korrekten Preis ein.
- [ ] Klick auf **Abschließen**.

**Erwartetes Ergebnis:** Der Artikel ist als **Freigegeben** markiert. Im Tab **Referenz** sind Spezifikationen und Preis befüllt.

---

## 5. ERP-Synchronisation

- [ ] Wähle in der Artikelliste einen oder mehrere freigegebene Artikel aus (Checkbox links).
- [ ] Klick in der Aktionsleiste auf **ERP-Sync**.
- [ ] Bestätige den Dialog.

**Erwartetes Ergebnis:** Eine Erfolgsmeldung erscheint. Keine Fehlermeldungen. Die Artikel wurden ins ERP-System übertragen.

---

## 6. Artikel umlagern

- [ ] Öffne einen Artikel mit einem bekannten Lagerort.
- [ ] Wechsle zum Tab **Vorrat**.
- [ ] Klick auf **Umlagern**.
- [ ] Wähle einen anderen Behälter als Ziel (per QR-Scan oder Behälter-ID eingeben).
- [ ] Bestätige die Umlagerung.

**Erwartetes Ergebnis:** Im Tab **Vorrat** und in der Artikelliste erscheint der neue Lagerort. Der alte Lagerort ist nicht mehr angezeigt.

---

## 7. Behälter umlagern

- [ ] Öffne die Behälterliste und wähle einen Behälter aus.
- [ ] Klick auf **Umlagern**.
- [ ] Wähle ein anderes Regal als Ziel.
- [ ] Bestätige die Umlagerung.

**Erwartetes Ergebnis:** In der Behälterdetailansicht steht der neue Regalstandort. In der Artikelliste zeigt die Spalte **Standort** für alle Artikel in diesem Behälter den neuen Standort.

---

## 8. QR-Code scannen

### 8a. Direkter Scan

- [ ] Öffne die App auf einem Mobilgerät.
- [ ] Tipp auf das **Scan**-Symbol in der Navigation.
- [ ] Scanne das QR-Etikett eines Artikels oder Behälters.

**Erwartetes Ergebnis:** Die Detailansicht des gescannten Artikels oder Behälters öffnet sich sofort.

### 8b. Artikel suchen (Finden-Funktion)

- [ ] Öffne einen Artikel und wechsle zum Tab **Vorrat**.
- [ ] Tipp auf **Finden**.
- [ ] Scanne mehrere QR-Codes, bis der gesuchte Artikel gefunden wird.

**Erwartetes Ergebnis:** Beim Scan des richtigen Artikels erscheint ein akustisches Signal und das Gerät vibriert. Die Kamera schließt sich automatisch.

---

## 9. Etiketten drucken

### 9a. Artikeletikett

- [ ] Öffne einen Artikel und wechsle zum Tab **Vorrat**.
- [ ] Klick auf **Etikett drucken**.
- [ ] Bestätige den Druckdialog.

**Erwartetes Ergebnis:** Das Artikeletikett (29×90 mm) mit QR-Code und Artikelnummer wird gedruckt. Kein Fehler erscheint.

### 9b. Behälteretikett

- [ ] Öffne einen Behälter.
- [ ] Klick auf **Etikett drucken**.

**Erwartetes Ergebnis:** Das Behälteretikett (62×100 mm) wird gedruckt.

---

## 10. CSV-Export

- [ ] Öffne die Artikelliste.
- [ ] Wähle mehrere Artikel aus.
- [ ] Klick auf **Exportieren** in der Aktionsleiste.
- [ ] Wähle das Format **ERP / Automatisch**.
- [ ] Lade die Datei herunter.

**Erwartetes Ergebnis:** Die heruntergeladene CSV-Datei lässt sich öffnen und enthält die erwarteten Spalten (Artikelnummer, Beschreibung, Preis, Lagerort, u. a.).

---

## 11. Suche und Filter

- [ ] Gib in der Suchleiste oben eine bekannte Artikelnummer ein und drück Enter.

**Erwartetes Ergebnis:** Der Artikel erscheint sofort in den Ergebnissen.

- [ ] Geh zur Artikelliste und gib im Feld **Behälter** eine bekannte Behälter-ID ein (z. B. `B-001`).

**Erwartetes Ergebnis:** Nur Artikel in diesem Behälter werden angezeigt.

- [ ] Setze den Shop-Filter auf **im Shop**.

**Erwartetes Ergebnis:** Nur Artikel, die als Shopartikel freigegeben sind, werden angezeigt.

---

## Auffälligkeiten / Fehler

Notiere hier alle beobachteten Probleme:

```
1. _______________________________________________________________

2. _______________________________________________________________

3. _______________________________________________________________
```

---

*Checkliste abgeschlossen:* ☐ Ja, alle Tests bestanden &nbsp;&nbsp; ☐ Nein, Fehler gefunden (siehe oben)
