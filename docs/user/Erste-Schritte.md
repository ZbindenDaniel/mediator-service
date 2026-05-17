# Erste Schritte

Willkommen im Lagerverwaltungssystem. Dieses System hilft Ihnen dabei, Artikel zu erfassen, zu lagern, zu suchen und ins ERP-System zu übertragen. Diese Anleitung zeigt Ihnen die wichtigsten Schritte für den Einstieg.

---

## 1. Zugang und Browser

Öffnen Sie die Anwendung in einem aktuellen Browser (Google Chrome oder Firefox empfohlen). Die Anwendung funktioniert auf dem Desktop und auf Mobilgeräten. Für das QR-Scannen benötigen Sie ein Mobilgerät mit Kamera.

Beim ersten Aufruf werden Sie nach einem **Benutzernamen** gefragt. Dieser Name erscheint in der Aktivitätshistorie, damit nachvollzogen werden kann, wer was getan hat.

---

## 2. Übersicht der Bereiche

Die Navigation befindet sich oben im Bildschirm:

- **+ (Plus-Symbol)** — Neuen Artikel erfassen
- **Listen-Symbol** — Alle Artikel anzeigen
- **Karton-Symbol** — Alle Behälter und Regale anzeigen
- **Puls-Symbol** — Letzte Aktivitäten anzeigen
- **Etiketten-Symbol** — Unbearbeitete Lieferungen (Stubs)
- **Fragezeichen-Symbol** — Diese Hilfeseite
- **Suchfeld** — Direkt nach Artikelnummern, Behälter-IDs oder Beschreibungen suchen

---

## 3. Artikel anlegen

1. Klicken Sie auf das **+**-Symbol oben links.
2. Geben Sie eine **Artikelnummer** ein (Pflichtfeld).
3. Wählen Sie eine **Kategorie** und **Unterkategorie** aus.
4. Wählen Sie die **Einheit**: **Stück** für Einzelgeräte (mit Seriennummer), **Menge** für Massenware.
5. Geben Sie optional Maße und Gewicht ein.
6. Klicken Sie auf **Weiter** — Sie werden zur Qualitätsprüfung weitergeleitet.
7. Beantworten Sie die Qualitätsfragen und bestätigen Sie.
8. Klicken Sie auf **Speichern**.

Der Artikel erscheint jetzt in der Artikelliste. Ein QR-Etikett kann direkt nach dem Speichern gedruckt werden.

---

## 4. QR-Code scannen

Mit der Scan-Funktion können Sie schnell zu einem Artikel oder Behälter navigieren, ohne suchen zu müssen.

1. Öffnen Sie die Anwendung auf Ihrem Mobilgerät.
2. Tippen Sie auf das **Scan**-Symbol in der Navigation.
3. Halten Sie die Kamera auf das QR-Etikett eines Artikels oder Behälters.
4. Die Detailansicht öffnet sich automatisch.

**Artikel suchen (Finden-Funktion):** Wenn Sie einen bestimmten Artikel physisch suchen, öffnen Sie den Artikel in der Liste, wechseln Sie zum Tab **Vorrat** und tippen Sie auf **Finden**. Scannen Sie dann QR-Codes im Lager, bis das Gerät vibriert und ein Ton ertönt — das bedeutet: gefunden!

---

## 5. Artikel finden

- **Suche:** Geben Sie im Suchfeld oben eine Artikelnummer oder Beschreibung ein.
- **Filter:** In der Artikelliste können Sie nach Behälter, Qualität, Shop-Status und Platzierungsstatus filtern.
- **Direktnavigation:** Geben Sie eine Behälter-ID (z. B. `B-042`) direkt ins Suchfeld ein, um sofort zur Behälterdetailansicht zu springen.

---

## 6. Artikel und Behälter umlagern

**Artikel umlagern** (in einen anderen Behälter):
1. Öffnen Sie den Artikel → Tab **Vorrat** → **Umlagern**.
2. Scannen Sie den Ziel-Behälter oder geben Sie seine ID ein.
3. Bestätigen Sie.

**Behälter umlagern** (auf ein anderes Regal):
1. Öffnen Sie den Behälter → Schaltfläche **Umlagern**.
2. Wählen Sie das Zielregal aus oder scannen Sie es.
3. Bestätigen Sie.

Der neue Standort ist sofort in der Artikel- und Behälteransicht sichtbar.

---

## 7. Etiketten drucken

Jeder Artikel und jeder Behälter hat ein QR-Etikett.

- **Artikeletikett drucken:** Artikel öffnen → Tab **Vorrat** → **Etikett drucken**.
- **Behälteretikett drucken:** Behälter öffnen → **Etikett drucken**.

Achten Sie darauf, dass der Drucker eingeschaltet und verbunden ist. Bei Problemen wenden Sie sich an die zuständige Person für die Druckerverwaltung.

---

## 8. KI-Unterstützung

Das System kann Artikelspezifikationen, Kategorien und Preisvorschläge automatisch ermitteln.

1. Öffnen Sie einen Artikel → Tab **KI**.
2. Klicken Sie auf **KI-Anreicherung starten**.
3. Die KI durchläuft mehrere Phasen (Extraktion, Kategorisierung, Preisermittlung).
4. Wenn der Status **Überprüfung erforderlich** erscheint, klicken Sie auf **Review durchführen**.
5. Prüfen Sie die Vorschläge und bestätigen Sie oder korrigieren Sie sie.
6. Klicken Sie auf **Abschließen**.

Nach der Freigabe ist der Artikel für den Export ins ERP-System bereit.

---

## 9. ERP-Synchronisation

Freigegebene Artikel können ins ERP-System übertragen werden:

1. Wählen Sie einen oder mehrere Artikel in der Liste aus (Checkbox).
2. Klicken Sie in der Aktionsleiste auf **ERP-Sync**.
3. Bestätigen Sie den Dialog.

Eine Erfolgsmeldung bestätigt die Übertragung. Bei Fehlern wenden Sie sich bitte an Ihre Systemadministration.

---

## 10. Hilfe und Support

Bei Fragen zur Bedienung steht Ihnen diese Hilfeseite jederzeit zur Verfügung. Zur Überprüfung einer neuen Softwareversion verwenden Sie bitte die **Freigabe-Checkliste**.

Bei häufigen Problemen (Drucker, Bilder, WebDAV, versehentliche Fehler) finden Sie Schritt-für-Schritt-Anleitungen in der **Fehlerbehebung**.

Bei technischen Problemen, die Sie selbst nicht lösen können, wenden Sie sich mit einem Screenshot und der Artikelnummer an Ihre Systemadministration.
