# Einzelteile erfassen

## Wie funktioniert das bei uns?

Ein Gerät wird **zuerst als Ganzes** erfasst und bewertet — so, wie es reinkommt, ohne es zu öffnen. Wer mehr wissen will (oder das Gerät als Teilespender nutzt), nimmt es danach auf der Seite **Einzelteile** auseinander: Teil für Teil, in der Reihenfolge, in der man ein Gerät tatsächlich zerlegt.

Jedes bewertete Teil macht die Bewertung des Geräts **genauer** — sie wird dadurch nicht schlechter, nur weil man anfängt.

---

## 1. Beim Erfassen: nur das Gerät

Beim Anlegen fragt die Qualitätsprüfung nur, was man am **ganzen Gerät** sieht oder prüft: startet es, Display, Tastatur, Gehäuse, Scharniere, Akku, RAM und Speicher. Einzelne Bauteile wie WLAN-Karte oder Antennen kommen hier nicht vor.

Wenn ein **neuer Artikel** angelegt wird, sind unter **Langtext** die Spezifikationen der Kategorie schon vorbereitet (z. B. Prozessor, Displaygrösse). Fülle aus, was du weisst. Fehlen wichtige Angaben, fragt das System beim Speichern nach — speichern geht trotzdem.

---

## 2. Einzelteile öffnen

Öffne das Gerät, Tab **Instanz** → Knopf **Einzelteile**. (Im Tab **Zubehör** gibt es denselben Knopf; dort bleiben nur noch verknüpftes Zubehör wie Ladegeräte.)

Die Seite hat zwei Hälften:

| Links: **Aufbau** | Rechts: **Zustand** |
|---|---|
| Was steckt im Gerät, was ist da? Gruppiert nach **Arbeitsschritten** (1 · Akku & Bodenabdeckung, 2 · Speicher & Funk, …). | Die Bewertung des Teils, das du links angeklickt hast — nur seine eigenen Fragen. |

Ganz oben im Baum steht das **Gerät** selbst: anklicken, um rechts die Bewertung des ganzen Geräts zu ändern. Darunter verzweigen die Arbeitsschritte, darunter die Teile.

**Schliessen:** Knopf **✕ Schliessen** oben rechts (oder Taste **Esc**) — zurück zum Artikel.

---

## 3. Vorhanden oder nicht? (links)

In jeder Zeile wählst du direkt:

| Knopf | Bedeutung | Zählt in der Bewertung |
|---|---|---|
| **✓ da** | Teil ist vorhanden | erst, wenn das Teil bewertet ist |
| **✕ fehlt** | sollte da sein, fehlt aber | ja, als 0 |
| **– n. v.** | dieses Modell hat das Teil nicht | nein |
| **▣ fest** | fest verbaut (z. B. verlöteter RAM) | nein — wird am Gerät beurteilt |

Jeder Klick wird sofort gespeichert. Nochmals auf den gewählten Knopf klicken löscht die Angabe.

**Gestrichelter Knopf** = Vorgabe (z. B. „n. v." beim zweiten Laufwerk, das selten verbaut ist). Sie ist noch nicht bestätigt; ein Klick darauf bestätigt sie.

Die Zahl rechts beim Arbeitsschritt (z. B. **2/3**) zeigt, wie viele Teile du schon angeschaut hast.

---

## 4. Ein Teil bewerten (rechts)

1. Links auf den **Namen** des Teils klicken.
2. Rechts die Fragen zum Teil beantworten (Zustand, Teilenummer/FRU, …).
3. **Speichern** — beim ersten Speichern wird das Teil angelegt (es bekommt eine Nummer wie `C-104523-2132-0001`: Gerät · Teiletyp · laufende Nummer). Danach klickst du links das nächste Teil an.

Ungespeicherte Eingaben bleiben erhalten, wenn du zwischendurch ein anderes Teil anklickst oder die Seite neu lädst.

Baugruppen wie die **Displayassembly** haben selbst wieder Teile: sobald sie bewertet ist, erscheinen ihre Teile eingerückt darunter.

---

## 5. Entnehmen, Lösen, Artikel

Bei einem erfassten Teil, das noch im Gerät steckt, gibt es rechts unten:

- **Entnehmen…** — Teil ausgebaut: Behälter-ID eingeben. Danach steht links „entnommen · B-042", und das Teil zählt beim Gerät als fehlend.
- **Lösen** — Teil war falsch erfasst: löscht das Teil (samt Bewertung), der Platz ist wieder frei.
- **Artikel-Details** — öffnet das Teil wie jeden anderen Artikel.

Bei einem noch nicht erfassten Teil: **Mit Artikel erfassen…** verknüpft es gleich mit einem bestehenden (oder neuen) Artikel, z. B. einem bekannten RAM-Riegel.

---

## Beispiel: Laptop

1. Laptop erfassen: startet, Display hat Kratzer, 16 GB RAM, 512 GB SSD → Bewertung z. B. „Gut".
2. **Einzelteile** öffnen. Schritt 1: Akku **✓ da**, Bodenabdeckung **✓ da**, CMOS-Batterie **✕ fehlt**.
3. Auf **Akku** klicken → rechts „Zustand des Teils: Gut", FRU eintragen → **Speichern**.
4. Weiter mit der Bodenabdeckung, dann Schritt 2 …
5. Akku ausbauen: Akku anklicken → **Entnehmen…** → `B-042`.
