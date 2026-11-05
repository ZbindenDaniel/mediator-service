# KI-Cockpit
<!-- feature: agentic -->

Im Tab **KI** eines Artikels steuerst du *einen* KI-Lauf. Das **KI-Cockpit** ist die Sicht von oben: Wie läuft die KI insgesamt, was fehlt systematisch, und welche Schalter steuern das Ganze? Du öffnest es über das **Roboter-Symbol** (KI-Läufe) in der Navigation.

> Faustregel: Ein falsches Feld bei einem Artikel → im Artikel korrigieren. Dasselbe Problem bei 40 Artikeln → im Cockpit als Klasse angehen.

Ansehen kann das Cockpit jede:r. Die **Hebel** umlegen dürfen nur Admins — alle anderen sehen sie gesperrt mit dem Hinweis **Nur für Admins**.

---

## 1. Hebel

Vier Schalter, jeweils **An** oder **Aus**:

| Hebel | Was er tut, wenn er an ist |
|---|---|
| **Auto-Freigabe** | Saubere Läufe mit hoher Datenqualität werden ohne Review freigegeben. Die Mindest-Qualität steht unter den Hebeln (z. B. „Auto-Freigabe ab Datenqualität 4/5“). |
| **Auto-Rework** | Veraltete, schon freigegebene Artikel werden im Leerlauf neu angereichert. Arbeitet auch die abgelehnten Artikel mit Notiz ab (siehe unten). |
| **Auto-Review** | Veraltete Artikel, die noch auf ein Review warten, werden neu beurteilt — die Review-Warteschlange schrumpft. |
| **Auto-Verteilung** | Freie KI-Plätze werden automatisch mit Artikeln gefüllt, die noch nie angereichert wurden. |

Die Hebel wirken ab dem nächsten Durchlauf der Warteschlange (wenige Sekunden) und bleiben auch nach einem Neustart so, wie du sie gestellt hast. Jedes Umlegen wird mit deinem Namen in den Aktivitäten protokolliert.

**Sweep jetzt** startet den Self-Heal sofort, statt auf den nächsten Leerlauf zu warten. Danach steht daneben, was passiert ist, z. B. „3 neu eingereiht · 12 neu gestempelt“ oder „Keine Aktion: Auto-Rework/Auto-Review sind aus.“

**Aktualisieren** lädt alle Zahlen neu.

> Die Zeile unter den Hebeln zeigt die festen Grenzen: ab welcher Qualität automatisch freigegeben wird, wie viele Läufe höchstens gleichzeitig warten und wie lange der Self-Heal bei einem Artikel Pause macht, bevor er ihn erneut anfasst.

### Was heisst „veraltet“?

Ein Artikel ist veraltet, wenn sich seit seinem letzten KI-Lauf die Regeln geändert haben — zum Beispiel welche Spezifikationen für seine Kategorie Pflicht sind oder wie Werte geschrieben werden. Der Self-Heal bringt solche Artikel auf den neuen Stand, und zwar so sparsam wie möglich: nur die betroffenen Felder neu, nur die Formulierung neu, oder — wenn sich inhaltlich nichts ändert — nur die Version neu stempeln.

---

## 2. Verhalten der Pipeline

Ein Balkendiagramm zeigt, wie viele Artikel in welchem KI-Status sind: **Nicht gestartet**, **Wartet**, **Läuft**, **Review nötig**, **Freigegeben**, **Auto-freigegeben**, **Abgelehnt**, **Fehlgeschlagen**, **Abgebrochen**. Grün ist erledigt, orange wartet auf Menschen, rot braucht Aufmerksamkeit.

Darunter zwei Zahlen:

- **veraltet (Self-Heal)** — so viele Artikel würde der Self-Heal anfassen.
- **zur Korrektur (abgelehnt + Notiz)** — so viele Artikel wurden im Review mit einer Notiz abgelehnt und warten auf einen korrigierten Lauf.

### Ablehnen mit Notiz — so lernt die KI

1. Im Review eines Artikels die Fehler korrigieren und im Feld **Feedback** notieren, was falsch war (z. B. „Prozessor fehlt, steht auf dem Typenschild“).
2. **Ablehnen** klicken.
3. Ist **Auto-Rework** an, startet der Self-Heal später einen neuen Lauf und gibt der KI deine Notiz als Anweisung mit. Abgelehnte Artikel mit Notiz kommen dabei vor den nur veralteten dran.
4. Sobald der neue Lauf da ist, verschwindet der Artikel aus **zur Korrektur**.

Ist **Auto-Rework** aus, bleibt die Zahl stehen — dann musst du die Artikel einzeln im Tab **KI** neu starten.

---

## 3. Offene Befunde — was systematisch fehlt

Nach jedem Lauf prüft das System das Ergebnis und hält **Befunde** fest. Das Cockpit fasst sie zu **Klassen** zusammen: gleicher Befund × gleiches Feld × gleiche Kategorie. So siehst du zum Beispiel „Pflichtfeld fehlt · Prozessor · Laptops — 37“ statt 37 einzelne Artikel.

Oben stehen die Zahlen: Artikel mit **blockierendem Befund**, **mit Warnung** und **mit Hinweis**.

| Befund | Bedeutung |
|---|---|
| **Pflichtfeld fehlt** | Eine Spezifikation, die für diese Kategorie Pflicht ist, ist leer |
| **Unerwünschter Text** | Werbe- oder Füllfloskeln, die nicht in den Artikel gehören |
| **Intake-Konflikt** | Die KI widerspricht dem, was bei der Erfassung festgehalten wurde |
| **Standards-Verstoß** | Ein Wert ist nicht im vorgeschriebenen Format |

| Schwere | Bedeutung |
|---|---|
| **Blockierend** | Der Artikel darf so nicht automatisch freigegeben werden |
| **Warnung** | Sollte behoben werden |
| **Hinweis** | Schönheitsfehler |

### Eine Klasse bearbeiten

1. Klick auf den Befund (**▸**). Es klappen **Beispiele** und die betroffenen Artikelnummern auf — ein Klick auf eine Nummer öffnet den Artikel.
2. Schau dir zwei, drei Beispiele an: Ist das wirklich ein KI-Fehler oder fehlt die Information schlicht (z. B. kein Typenschild-Foto)?
3. Klick auf **Überarbeiten (max 25)**. Bis zu 25 Artikel dieser Klasse werden neu eingereiht — und zwar nur für das betroffene Feld, der Rest bleibt.
4. Gibt es mehr als 25, steht das in der Meldung („von 37, Rest beim nächsten Durchlauf“). Klick später nochmal.

Die Befunde aktualisieren sich erst, wenn die Läufe fertig sind. Bei vielen Klassen siehst du die grössten zuerst.

> Für **Überarbeiten** brauchst du einen gesetzten Benutzernamen. Kommt dieselbe Klasse nach dem Überarbeiten wieder, liegt das Problem eher an den Regeln oder Quellen als am einzelnen Lauf — dann den Entwickler:innen melden.

---

## 4. Letzte KI-Ereignisse

Unten im Cockpit stehen die letzten 15 KI-Ereignisse: umgelegte Hebel, Self-Heal-Durchläufe, Auto-Freigaben und Fehler — mit wer und wann.
<!-- if-feature: logs -->
**Alle KI-Ereignisse →** öffnet die [Aktivitäten](/hilfe?doc=9_Aktivitaeten), gefiltert auf das Thema **KI**.
<!-- end-feature -->

Die Einzelschritte pro Lauf (eingereiht, Ergebnis erhalten …) stehen nicht hier, sondern in der Geschichte des jeweiligen Artikels.

---

## Wenn's hakt

| Problem | Was tun |
|---|---|
| Hebel lassen sich nicht umlegen | Du bist nicht als Admin angemeldet — in der Administration anmelden oder eine Admin-Person fragen |
| „Dispatcher noch nicht bereit“ nach **Sweep jetzt** | Das System ist gerade gestartet. Der Sweep läuft automatisch beim nächsten Durchlauf |
| **zur Korrektur** sinkt nicht | **Auto-Rework** einschalten |
| Viele **Fehlgeschlagen** im Diagramm | Siehe [Fehlerbehebung](/hilfe?doc=2_Fehlerbehebung), Abschnitt *KI-Anreicherung hängt* |
| „Cockpit konnte nicht geladen werden.“ | Seite neu laden; hilft das nicht, Systemstatus in der Administration prüfen |
