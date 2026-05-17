# Freigabe-Checkliste

Verwenden Sie diese Checkliste, um vor einer neuen Softwareversion sicherzustellen, dass alle wichtigen Funktionen korrekt arbeiten. Haken Sie jeden Punkt ab, sobald er erfolgreich geprüft wurde.

---

**Tester:** ____________________________

**Datum:** ____________________________

**Version / Release:** ____________________________

---

## 1. Artikel erfassen

- [ ] Öffnen Sie die Anwendung und klicken Sie oben links auf das **+**-Symbol.
- [ ] Füllen Sie die Pflichtfelder aus: Artikelnummer, Kategorie, Unterkategorie und Einheit (Stück oder Menge).
- [ ] Geben Sie optional Maße (Länge, Breite, Höhe) und Gewicht ein.
- [ ] Klicken Sie auf **Weiter** und schließen Sie die Qualitätsprüfung ab.
- [ ] Klicken Sie auf **Speichern**.

**Erwartetes Ergebnis:** Der neue Artikel erscheint in der Artikelliste mit der eingegebenen Artikelnummer.

---

## 2. Qualitätsprüfung durchführen

- [ ] Öffnen Sie einen neu erfassten Artikel über die Artikelliste.
- [ ] Wechseln Sie zum Tab **Vorrat**.
- [ ] Klicken Sie auf **Qualität bewerten** (sofern noch keine Bewertung vorliegt).
- [ ] Beantworten Sie alle Fragen im Qualitätsfragebogen (z. B. Tastaturzustand, RAM, Akku bei Laptops).
- [ ] Bestätigen Sie die Bewertung.

**Erwartetes Ergebnis:** Im Tab **Vorrat** ist eine Qualitätsnote (1–5) gespeichert. Im Tab **Referenz** sind die ermittelten Spezifikationsfelder (z. B. RAM, SSD) sichtbar.

---

## 3. Spezifikationsfelder prüfen

- [ ] Öffnen Sie einen Artikel, dessen Unterkategorie einen Spezifikationsvertrag hat (z. B. Laptop).
- [ ] Wechseln Sie zum Tab **Referenz**.
- [ ] Blättern Sie zur Tabelle **Spezifikationen** (Langtext-Felder).

**Erwartetes Ergebnis:** Die für diese Unterkategorie vorgeschriebenen Felder (z. B. „RAM", „Festplatte", „Betriebssystem") sind sichtbar — auch wenn sie noch leer sind. Leere Felder weisen darauf hin, dass sie noch befüllt werden müssen.

---

## 4. KI-Anreicherung starten und prüfen

- [ ] Öffnen Sie einen Artikel mit unvollständigen Spezifikationen.
- [ ] Wechseln Sie zum Tab **KI**.
- [ ] Klicken Sie auf **KI-Anreicherung starten**.
- [ ] Warten Sie, bis der Lauf die Phasen Extraktion → Kategorisierung → Preisermittlung durchläuft.
- [ ] Sobald der Status **Überprüfung erforderlich** erscheint, klicken Sie auf **Review durchführen**.
- [ ] Prüfen Sie die vorgeschlagenen Spezifikationsfelder: Bestätigen Sie korrekte Angaben, entfernen Sie falsche.
- [ ] Bestätigen Sie den vorgeschlagenen Preis oder geben Sie einen korrekten Preis ein.
- [ ] Klicken Sie auf **Abschließen**.

**Erwartetes Ergebnis:** Der Artikel ist als **Freigegeben** markiert. Im Tab **Referenz** sind Spezifikationen und Preis befüllt.

---

## 5. ERP-Synchronisation

- [ ] Wählen Sie in der Artikelliste einen oder mehrere freigegebene Artikel aus (Checkbox links).
- [ ] Klicken Sie in der Aktionsleiste auf **ERP-Sync**.
- [ ] Bestätigen Sie den Dialog.

**Erwartetes Ergebnis:** Eine Erfolgsmeldung erscheint. Es werden keine Fehlermeldungen angezeigt. Die Artikel wurden ins ERP-System übertragen.

---

## 6. Artikel umlagern

- [ ] Öffnen Sie einen Artikel mit einem bekannten Lagerort.
- [ ] Wechseln Sie zum Tab **Vorrat**.
- [ ] Klicken Sie auf **Umlagern**.
- [ ] Wählen Sie einen anderen Behälter als Ziel (entweder per QR-Scan oder per Eingabe der Behälter-ID).
- [ ] Bestätigen Sie die Umlagerung.

**Erwartetes Ergebnis:** Im Tab **Vorrat** und in der Artikelliste erscheint der neue Lagerort. Der alte Lagerort ist nicht mehr angezeigt.

---

## 7. Behälter umlagern

- [ ] Öffnen Sie die Behälterliste und wählen Sie einen Behälter aus.
- [ ] Klicken Sie auf **Umlagern**.
- [ ] Wählen Sie ein anderes Regal als Ziel.
- [ ] Bestätigen Sie die Umlagerung.

**Erwartetes Ergebnis:** In der Behälterdetailansicht steht der neue Regalstandort. In der Artikelliste zeigt die Spalte **Standort** für alle Artikel in diesem Behälter den neuen Standort.

---

## 8. QR-Code scannen

### 8a. Direkter Scan

- [ ] Öffnen Sie die Anwendung auf einem Mobilgerät.
- [ ] Tippen Sie auf das **Scan**-Symbol in der Navigation.
- [ ] Scannen Sie das QR-Etikett eines Artikels oder Behälters.

**Erwartetes Ergebnis:** Die Detailansicht des gescannten Artikels oder Behälters öffnet sich sofort.

### 8b. Artikel suchen (Finden-Funktion)

- [ ] Öffnen Sie einen Artikel und wechseln Sie zum Tab **Vorrat**.
- [ ] Tippen Sie auf **Finden**.
- [ ] Scannen Sie mehrere QR-Codes, bis der gesuchte Artikel gefunden wird.

**Erwartetes Ergebnis:** Beim Scan des richtigen Artikels erscheint ein akustisches Signal und das Gerät vibriert. Die Kamera schließt sich automatisch.

---

## 9. Etiketten drucken

### 9a. Artikeletikett

- [ ] Öffnen Sie einen Artikel und wechseln Sie zum Tab **Vorrat**.
- [ ] Klicken Sie auf **Etikett drucken**.
- [ ] Bestätigen Sie den Druckdialog.

**Erwartetes Ergebnis:** Das Artikeletikett (29×90 mm) mit QR-Code und Artikelnummer wird gedruckt. Kein Fehler erscheint.

### 9b. Behälteretikett

- [ ] Öffnen Sie einen Behälter.
- [ ] Klicken Sie auf **Etikett drucken**.

**Erwartetes Ergebnis:** Das Behälteretikett (62×100 mm) wird gedruckt.

---

## 10. CSV-Export

- [ ] Öffnen Sie die Artikelliste.
- [ ] Wählen Sie mehrere Artikel aus.
- [ ] Klicken Sie auf **Exportieren** in der Aktionsleiste.
- [ ] Wählen Sie das Format **ERP / Automatisch**.
- [ ] Laden Sie die Datei herunter.

**Erwartetes Ergebnis:** Die heruntergeladene CSV-Datei lässt sich öffnen und enthält die erwarteten Spalten (Artikelnummer, Beschreibung, Preis, Lagerort, u. a.).

---

## 11. Suche und Filter

- [ ] Geben Sie in der Suchleiste oben eine bekannte Artikelnummer ein und drücken Sie Enter.

**Erwartetes Ergebnis:** Der Artikel erscheint sofort in den Ergebnissen.

- [ ] Gehen Sie zur Artikelliste und geben Sie im Feld **Behälter** eine bekannte Behälter-ID ein (z. B. `B-001`).

**Erwartetes Ergebnis:** Nur Artikel in diesem Behälter werden angezeigt.

- [ ] Setzen Sie den Shop-Filter auf **im Shop**.

**Erwartetes Ergebnis:** Nur Artikel, die als Shopartikel freigegeben sind, werden angezeigt.

---

## Auffälligkeiten / Fehler

Notieren Sie hier alle beobachteten Probleme:

```
1. _______________________________________________________________

2. _______________________________________________________________

3. _______________________________________________________________
```

---

*Checkliste abgeschlossen:* ☐ Ja, alle Tests bestanden &nbsp;&nbsp; ☐ Nein, Fehler gefunden (siehe oben)
