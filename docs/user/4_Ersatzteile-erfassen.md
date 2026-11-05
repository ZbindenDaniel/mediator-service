# Einzelteile erfassen

## Ablauf

1. Das Gerät wird **als Ganzes** erfasst und bewertet, ungeöffnet.
2. Soll es genauer bewertet oder als Teilespender genutzt werden, wird es auf der Seite **Einzelteile** zerlegt: Teil für Teil, in der Reihenfolge des tatsächlichen Ausbaus.

Jedes bewertete Teil ersetzt eine Schätzung durch eine konkrete Angabe. Die Gerätebewertung wird dadurch genauer. Sie sinkt nicht allein dadurch, dass du mit dem Zerlegen beginnst.

---

## 1. Beim Erfassen: nur das ganze Gerät

Beim Anlegen fragt die Qualitätsprüfung nur, was man am **ganzen Gerät** sieht oder prüft: startet es, Display, Tastatur, Gehäuse, Scharniere, Akku, RAM und Speicher. Einzelne Bauteile wie WLAN-Karte oder Antennen kommen hier nicht vor.

Wenn ein **neuer Artikel** angelegt wird, sind unter **Langtext** die Spezifikationen der Kategorie schon vorbereitet (z. B. Prozessor, Displaygrösse). Fülle aus, was du weisst. Fehlen Pflichtangaben, weist das System beim Speichern darauf hin. Speichern ist trotzdem möglich.

---

## 2. Einzelteile öffnen

Öffne das Gerät, Tab **Vorrat** → Knopf **Einzelteile**. Im Tab **Zubehör** gibt es denselben Knopf. Dort steht sonst nur verknüpftes Zubehör wie Ladegeräte.

Die Seite hat zwei Hälften:

| Links: **Aufbau** | Rechts: **Zustand** |
|---|---|
| Welche Teile das Gerät hat und ob sie vorhanden sind. Gruppiert nach **Arbeitsschritten** (1 · Akku & Bodenabdeckung, 2 · Speicher & Funk, …). | Die Fragen zum Teil, das du links angeklickt hast. |

Ganz oben im Baum steht das **Gerät** selbst: anklicken, um rechts die Bewertung des ganzen Geräts zu ändern. Darunter verzweigen die Arbeitsschritte, darunter die Teile.

**Gerätefragen werden ersetzt:** Manche Gerätefragen fassen mehrere Teile zusammen (z. B. „Gehäuse-Zustand“ = C-Cover und D-Cover). Sind alle diese Teile bewertet, wird die Gerätefrage gesperrt und durchgestrichen, mit dem Hinweis „ersetzt durch die Bewertung von …“. Ab dann zählt nur die Bewertung der Teile. So widersprechen sich Gerät und Teile nicht.

**Schliessen:** **✕ Schliessen** oben rechts oder Taste **Esc**. Du kommst zurück zum Artikel.

---

## 3. Vorhanden oder nicht? (links)

In jeder Zeile wählst du direkt:

| Knopf | Bedeutung | Zählt in der Bewertung |
|---|---|---|
| **✓ da** | Teil ist vorhanden | erst, wenn das Teil bewertet ist |
| **✕ fehlt** | sollte da sein, fehlt aber | ja, als 0 |
| **– n. v.** | dieses Modell hat das Teil nicht | nein |
| **▣ fest** | fest verbaut (z. B. verlöteter RAM) | erst, wenn das Teil bewertet ist. Lässt sich bewerten, aber nicht entnehmen. |

Jeder Klick wird sofort gespeichert. Ein zweiter Klick auf denselben Knopf löscht die Angabe.

**Gestrichelter Knopf** = Vorgabe, noch nicht bestätigt (z. B. „n. v.“ beim selten verbauten zweiten Laufwerk). Klick darauf bestätigt sie.

Die Zahl rechts beim Arbeitsschritt (z. B. **2/3**) zeigt, wie viele Teile du schon angeschaut hast.

---

## 4. Ein Teil bewerten (rechts)

1. Links auf den **Namen** des Teils klicken.
2. Rechts die Fragen zum Teil beantworten (Zustand, Teilenummer/FRU, …).
3. **Speichern**. Beim ersten Speichern wird das Teil angelegt und bekommt eine Nummer wie `C-104523-2132-0001` (Gerät · Teiletyp · laufende Nummer).
4. Links das nächste Teil anklicken.

Ungespeicherte Eingaben bleiben erhalten, wenn du zwischendurch ein anderes Teil anklickst oder die Seite neu lädst.

Baugruppen wie die **Displayassembly** haben eigene Teile. Sobald die Baugruppe bewertet ist, erscheinen diese eingerückt darunter.

---

## 5. Entnehmen, Lösen, Artikel

Bei einem erfassten Teil, das noch im Gerät steckt, gibt es rechts unten:

- **Entnehmen…**: Das Teil wurde ausgebaut. Wähle den Behälter, in den es kommt. Hat das Teil noch keinen Artikel, legst du ihn hier fest:
  - **Neuer Artikel**: Bezeichnung (z. B. „Akku · ThinkPad T480“), Hersteller und Teilenummer werden aus der Bewertung übernommen.
  - **Bestehender Artikel**: z. B. ein bereits erfasster RAM-Typ.

  Danach steht links „entnommen · B-042“, und das Teil zählt beim Gerät als fehlend. Teile, die noch im Gerät sind, stehen nicht in der Artikelliste, nur hier im Baum.
- Fest verbaute Teile haben kein **Entnehmen**.
- **Lösen**: Teil war falsch erfasst. Löscht das Teil mit seiner Bewertung; der Platz ist wieder frei.
- **Artikel-Details**: öffnet das Teil wie einen normalen Artikel.

Bei einem noch nicht erfassten Teil verknüpft **Mit Artikel erfassen…** es direkt mit einem bestehenden oder neuen Artikel.

---

## Beispiel: Laptop

1. Laptop erfassen: startet, Display hat Kratzer, 16 GB RAM, 512 GB SSD → Bewertung z. B. „Gut".
2. **Einzelteile** öffnen. Schritt 1: Akku **✓ da**, Bodenabdeckung **✓ da**, CMOS-Batterie **✕ fehlt**.
3. Auf **Akku** klicken → rechts „Zustand des Teils: Gut", FRU eintragen → **Speichern**.
4. Weiter mit der Bodenabdeckung, dann Schritt 2 …
5. Akku ausbauen: Akku anklicken → **Entnehmen…** → `B-042`.

Die Unterschiede zwischen Referenzdaten, einzelnen Exemplaren und Qualitätsantworten erklärt die Seite [Artikel](/hilfe?doc=6_Artikel).
