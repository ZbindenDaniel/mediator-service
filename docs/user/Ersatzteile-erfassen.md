# Ersatzteile erfassen (Zerlegen)

## Wie funktioniert das bei uns?

Manchmal landen Geräte bei uns, die sich nicht direkt als Ganzes verkaufen lassen — zu defekt, zu alt, oder es fehlen wichtige Teile. Statt sie einfach wegzuwerfen, zerlegen wir sie und verwerten die einzelnen Bauteile (RAM, SSD, Akku, Lüfter usw.) separat weiter.

Das System nennt das **Zerlegen**. Dabei musst du das Gerät nicht sofort physisch auseinanderbauen. Du kannst erst einmal im System festhalten, welche Teile vorhanden sind — und sie dann nach und nach erfassen und entnehmen, wenn es passt.

Das Gerät bleibt dabei im System erhalten. Es bekommt den Status **Ersatzteil** und zeigt an, welche Teile noch drin sind und welche bereits entnommen wurden. So hat man immer den Überblick.

---

## Wann lohnt sich das Zerlegen?

- Das Gerät ist nicht mehr funktionstüchtig oder zu stark beschädigt für einen Direktverkauf.
- Einzelne Bauteile (z. B. ein RAM-Riegel, eine SSD) sind gut erhalten und haben eigenständigen Wert.
- Du willst das Gerät als Teilespender für Reparaturen nutzen.

Geräte, die sich noch verkaufen lassen — auch mit kleinen Mängeln — müssen nicht zerlegt werden. Die Qualitätsbewertung hilft dir dabei einzuschätzen, was sinnvoller ist.

---

## Schritt-für-Schritt: Bauteile erfassen und entnehmen

### 1. Qualitätsprüfung: Bauteile dokumentieren

Beim Ausfüllen der **Qualitätsprüfung** eines Laptops, PCs oder Druckers erscheinen automatisch Fragen zu den Bauteilen:

- Ist ein Lüfter vorhanden?
- Akkuzustand?
- Wie viel RAM ist verbaut?
- Wie viel Speicher (SSD/HDD)?
- usw.

Beantworte diese Fragen so genau wie möglich. Die Antworten bestimmen, welche Slots im Zerlegen-Bereich erscheinen. Du musst das Gerät dafür noch nicht öffnen — Angaben aus dem Aufkleber oder dem BIOS reichen oft.

---

### 2. Zubehör-Tab → Zerlegen-Bereich öffnen

Öffne den Artikel und wechsle auf den Tab **Zubehör**. Falls für diesen Gerätetyp eine Zerlegen-Vorlage vorhanden ist, erscheint unten der Abschnitt **Zerlegen**.

Jede Zeile steht für ein mögliches Bauteil. Das Symbol links zeigt den aktuellen Stand:

| Symbol | Bedeutung |
|--------|-----------|
| ◎ | Bauteil noch nicht erfasst (unbekannt / vorhanden) |
| ✕ | Bei der Qualitätsprüfung als fehlend markiert |
| ◉ | Erfasst — noch im Gerät |
| ○ | Entnommen — befindet sich in einem Behälter |

---

### 3. Bauteil katalogisieren (Hinzufügen)

Wenn ein Bauteil den Status ◎ hat, kannst du es erfassen:

1. Klick auf **Hinzufügen** in der entsprechenden Zeile.
2. Ein Popup öffnet sich mit passenden Artikel-Vorschlägen (basierend auf Gerätehersteller und Bauteiltyp).
3. Den passenden Artikel auswählen — ein Klick auf **Ist es das?** genügt.
4. Falls kein Vorschlag passt, klick auf **Anderen suchen** und such manuell.
5. Nach der Bestätigung wechselt der Slot zu ◉ — das Bauteil ist jetzt als eigenständiger Artikel im System erfasst, liegt aber noch im Gerät.

> Auch wenn die Qualitätsprüfung ein Teil als „nicht vorhanden" markiert hat (✕), kannst du es nachträglich hinzufügen — z. B. wenn RAM später nachgerüstet wird. Der **Hinzufügen**-Knopf ist auch dann sichtbar.

---

### 4. Bauteil entnehmen (physisch ausbauen)

Wenn du ein Bauteil aus dem Gerät nimmst, gibt es zwei Szenarien:

**Einlagern (Normalfall):** Das Bauteil wird in einem Behälter aufbewahrt und bleibt im Lager.
1. Klick auf **Entnehmen** in der Zeile des katalogisierten Bauteils (◉).
2. Gib die **Behälter-ID** des Zielorts ein (z. B. `B-042`).
3. Bestätige mit **Entnehmen**.
4. Der Slot wechselt zu ○ mit Angabe des Lagerorts. Das Bauteil ist jetzt als eigenständiger Artikel suchbar.

**Direkt verkaufen:** Das Bauteil geht sofort raus — kein Lagerplatz nötig.
> Diese Option ist in Planung. Aktuell: Bauteil wie oben entnehmen, dann den Artikel manuell auf Menge 0 setzen, um anzuzeigen, dass er nicht mehr verfügbar ist.

In beiden Fällen wird die Qualitätsbewertung des Quellgeräts automatisch auf **Ersatzteil** gesetzt.

---

### 5. Bauteil-Link entfernen (Rückgängig machen)

Falls du den falschen Artikel ausgewählt hast, solange das Bauteil noch **nicht entnommen** wurde:

- Klick auf **Link entfernen**.
- Der erstellte Artikel und der Link werden gelöscht.

> **Achtung:** Nach der Entnahme (Status ○) kann der Link nicht mehr entfernt werden. Das Bauteil muss dann wie ein normaler Artikel behandelt werden.

**Szenario: Falsche Referenz, aber korrekte Instanz-Daten?** Wenn der Artikel-Link falsch ist, die Instanzdaten (Seriennummer, Spezifikationen) aber stimmen, ist aktuell kein einfaches Umhängen möglich. Dieses Szenario wird in einem separaten Task dokumentiert und adressiert.

---

## Was passiert mit dem Quellgerät?

Das Quellgerät bleibt im System und bekommt den Status **Ersatzteil**. Es ist weiterhin suchbar und in der Artikelliste sichtbar — es wird nicht gelöscht. Im Tab **Zubehör** siehst du jederzeit, welche Teile noch im Gerät sind und welche bereits entnommen wurden.

So kannst du das Gerät auch als Teilespender für Reparaturen nutzen, ohne den Überblick zu verlieren.

---

## Beispiel: Laptop zerlegen

1. Gerät kommt rein: Laptop, defektes Display, sonst in Ordnung.
2. **Qualitätsprüfung ausfüllen:** RAM 16 GB, SSD 512 GB, kein Akku vorhanden.
3. **Tab Zubehör öffnen:** Im Zerlegen-Bereich erscheinen Slots für RAM, SSD und Akku.
4. **RAM katalogisieren:** Klick auf **Hinzufügen** beim RAM-Slot → Vorschlag bestätigen → Status wechselt zu ◉.
5. **SSD katalogisieren:** Gleich vorgehen.
6. **Akku:** Steht auf ✕ (nicht vorhanden) — Slot bleibt leer.
7. **RAM entnehmen:** RAM ausgebaut, Klick auf **Entnehmen** → Behälter-ID `B-042` eingeben → bestätigen → Status wechselt zu ○.
8. Das Quellgerät zeigt jetzt Status **Ersatzteil**. Die SSD ist noch drin (◉), der RAM ist in B-042 (○).
