# Ersatzteile erfassen (Zerlegen)

Diese Anleitung beschreibt, wie Sie Bauteile aus einem defekten Gerät im System erfassen und verwalten.

---

## 1. Was ist die Zerlegen-Funktion?

Wenn ein Gerät zu defekt ist, um als Ganzes verkauft zu werden, können einzelne Bauteile (RAM, SSD, Akku, Lüfter usw.) entnommen und separat weiterverwendet oder verkauft werden.

Mit der **Zerlegen-Funktion** können Sie:
- festhalten, welche Bauteile in einem Gerät vorhanden sind,
- Bauteile als eigene Artikel im System erfassen (katalogisieren),
- Bauteile physisch entnehmen und einem Lagerplatz zuweisen.

---

## 2. Qualitätsprüfung: Bauteile erfassen

Beim Ausfüllen der **Qualitätsprüfung** eines Laptops, PCs oder Druckers erscheinen automatisch Fragen zu den Bauteilen des Geräts:

- Ist ein Lüfter vorhanden?
- Akkuzustand?
- Wie viel RAM ist verbaut?
- Wie viel Speicher (SSD/HDD)?
- usw.

Beantworten Sie diese Fragen so genau wie möglich. Die Antworten werden auf dem **Instanz-Tab** des Artikels als Spezifikationen gespeichert (z. B. "RAM: 16 GB") und steuern, welche Slots im Zerlegen-Bereich angezeigt werden.

---

## 3. Zubehör-Tab → Zerlegen-Bereich

Öffnen Sie einen Artikel und wechseln Sie auf den Tab **Zubehör**. Falls für diesen Gerätetyp eine Zerlegen-Vorlage existiert, erscheint unten auf der Seite der Abschnitt **Zerlegen**.

Jede Zeile steht für ein mögliches Bauteil. Das Symbol links zeigt den aktuellen Status:

| Symbol | Status | Bedeutung |
|---|---|---|
| ◎ | **Unbekannt / vorhanden** | Bauteil wurde noch nicht katalogisiert |
| ✕ | **Nicht vorhanden** | Qualitätsprüfung hat dieses Bauteil als fehlend markiert |
| ◉ | **Katalogisiert** | Bauteil ist erfasst und noch im Gerät |
| ○ | **Entnommen** | Bauteil wurde entnommen und befindet sich in einem Behälter |

---

## 4. Bauteil katalogisieren (Hinzufügen)

Wenn ein Bauteil den Status ◎ (unbekannt) hat, können Sie es katalogisieren:

1. Klicken Sie auf **Hinzufügen** in der entsprechenden Zeile.
2. Es öffnet sich ein Popup mit passenden Artikel-Vorschlägen (basierend auf Gerätehersteller und Bauteiltyp).
3. Wählen Sie den passenden Artikel aus — ein Klick auf **Ist es das?** genügt.
4. Falls kein Vorschlag passt, klicken Sie auf **Anderen suchen** und suchen Sie manuell.
5. Nach der Bestätigung wechselt der Slot zu ◉ (Katalogisiert) — das Bauteil ist jetzt als eigener Artikel im System erfasst und noch im Gerät.

---

## 5. Bauteil entnehmen (Entnehmen)

Wenn Sie ein Bauteil physisch aus dem Gerät nehmen und einlagern möchten:

1. Klicken Sie auf **Entnehmen** in der Zeile des katalogisierten Bauteils (◉).
2. Geben Sie die **Behälter-ID** des Zielorts ein (z. B. `B-042`).
3. Bestätigen Sie mit **Entnehmen**.

Nach der Entnahme:
- Der Slot wechselt zu ○ (Entnommen) mit Angabe des Lagerorts.
- Das Bauteil ist jetzt als eigenständiger Artikel suchbar und kann separat etikettiert und verkauft werden.
- Die Qualitätsbewertung des Quellgeräts wird automatisch auf **Ersatzteil** gesetzt.

---

## 6. Bauteil-Link entfernen

Falls Sie einen Bauteil-Link rückgängig machen möchten (z. B. weil Sie den falschen Artikel ausgewählt haben):

- Klicken Sie auf **Link entfernen** (nur sichtbar, solange das Bauteil noch nicht entnommen wurde).
- Der erstellte Artikel und der Link werden gelöscht.

> **Achtung:** Nach der Entnahme (Status ○) kann der Link nicht mehr entfernt werden. Das Bauteil muss dann wie ein normaler Artikel behandelt werden.

---

## 7. Hinweise

- **Qualitätsbewertung des Quellgeräts:** Sobald das erste Bauteil entnommen wird, wird die Qualitätsstufe des Geräts automatisch auf *Ersatzteil* gesetzt. Das signalisiert, dass das Gerät nicht mehr vollständig ist.
- **Suche:** Katalogisierte und entnommene Bauteile sind im System als normale Artikel suchbar. Der Lagerort ist im Feld "Standort" angegeben.
- **Nicht vorhanden (✕):** Slots mit diesem Status haben keinen "Hinzufügen"-Knopf — das Bauteil wurde bei der Qualitätsprüfung als fehlend bestätigt.
