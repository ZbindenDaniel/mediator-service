# KI-Cockpit
<!-- feature: agentic -->

Das **KI-Cockpit** zeigt alle KI-Läufe zusammen: wie viele in welchem Status sind, welche Fehler sich häufen, und welche automatischen Abläufe eingeschaltet sind. Öffnen über das **Roboter-Symbol** in der Navigation.

Einzelne Artikel bearbeitest du weiterhin im Tab **KI** des Artikels. Das Cockpit ist für Probleme, die viele Artikel gleichzeitig betreffen.

Ansehen können alle. Die Schalter umlegen können nur Admins; für alle anderen sind sie gesperrt (**Nur für Admins**).

---

## Begriffe

| Begriff | Bedeutung |
|---|---|
| **KI-Lauf** | Ein Durchgang für einen Artikel: Webseiten durchsuchen, Werte vorschlagen, Ergebnis prüfen |
| **Warteschlange** | Läufe, die auf einen freien Platz warten. Es laufen nur wenige gleichzeitig. |
| **Veraltet** | Der letzte Lauf eines Artikels wurde nach Regeln erstellt, die sich seither geändert haben (z. B. neue Pflicht-Spezifikationen für die Kategorie) |
| **Self-Heal** | Automatische Nachbearbeitung veralteter Artikel |
| **Befund** | Ein Problem, das das System nach einem Lauf im Ergebnis festgestellt hat |

---

## 1. Hebel (Schalter)

Vier Schalter, jeweils **An** oder **Aus**:

| Schalter | Wenn eingeschaltet |
|---|---|
| **Auto-Freigabe** | Läufe ohne blockierende Befunde und mit ausreichender Datenqualität werden ohne Review freigegeben. Die Mindestqualität steht unter den Schaltern (z. B. „ab Datenqualität 4/5“). |
| **Auto-Rework** | Veraltete, bereits freigegebene Artikel werden neu bearbeitet, wenn Plätze frei sind. Ausserdem werden im Review abgelehnte Artikel mit Notiz neu bearbeitet (siehe Abschnitt 2). |
| **Auto-Review** | Veraltete Artikel, die noch auf ein Review warten, werden neu bearbeitet. |
| **Auto-Verteilung** | Freie Plätze werden automatisch mit Artikeln gefüllt, die noch nie einen KI-Lauf hatten. |

Änderungen gelten nach wenigen Sekunden und bleiben auch nach einem Neustart bestehen. Jede Änderung wird mit deinem Namen in den Aktivitäten gespeichert.

**Sweep jetzt** startet die Nachbearbeitung veralteter Artikel sofort, statt auf freie Plätze zu warten. Danach steht das Ergebnis daneben, z. B. „3 neu eingereiht · 12 neu gestempelt“. „Keine Aktion: Auto-Rework/Auto-Review sind aus.“ heisst: Beide Schalter sind aus, es passiert nichts.

**Aktualisieren** lädt die Zahlen neu.

Die Zeile unter den Schaltern zeigt feste Grenzwerte: Mindestqualität für Auto-Freigabe, maximale Anzahl wartender Läufe, und wie lange ein Artikel nach einer Nachbearbeitung gesperrt bleibt, bevor er erneut bearbeitet werden kann.

### Was die Nachbearbeitung mit einem veralteten Artikel macht

Es wird nur so viel neu gemacht wie nötig:

| Aktion | Wann |
|---|---|
| Betroffene Felder neu | Nur einzelne Felder sind von der Regeländerung betroffen |
| Formulierung neu | Nur Schreibweise oder Wortlaut haben sich geändert |
| Ganzer Lauf neu | Die Änderung betrifft den ganzen Artikel |
| Nur Version aktualisieren | Inhaltlich ändert sich nichts; der Artikel wird nur als aktuell markiert („neu gestempelt“) |

---

## 2. Verhalten der Pipeline

Das Balkendiagramm zeigt, wie viele Artikel in welchem KI-Status sind: **Nicht gestartet**, **Wartet**, **Läuft**, **Review nötig**, **Freigegeben**, **Auto-freigegeben**, **Abgelehnt**, **Fehlgeschlagen**, **Abgebrochen**. Grün = erledigt, orange = wartet auf eine Person, rot = Fehler oder abgelehnt.

Darunter zwei Zahlen:

- **veraltet (Self-Heal)**: Anzahl veralteter Artikel.
- **zur Korrektur (abgelehnt + Notiz)**: Artikel, die im Review mit einer Notiz abgelehnt wurden und noch keinen neuen Lauf hatten.

### Ablehnen mit Notiz

1. Im Review eines Artikels die Werte korrigieren und im Feld **Feedback** beschreiben, was falsch war (z. B. „Prozessor fehlt, steht auf dem Typenschild“).
2. **Ablehnen** klicken.
3. Ist **Auto-Rework** eingeschaltet, startet das System später einen neuen Lauf. Die Notiz wird diesem Lauf als Anweisung mitgegeben. Abgelehnte Artikel mit Notiz kommen vor den veralteten an die Reihe.
4. Nach dem neuen Lauf zählt der Artikel nicht mehr zu **zur Korrektur**.

Ist **Auto-Rework** ausgeschaltet, bleiben diese Artikel liegen. Du musst sie dann einzeln im Tab **KI** neu starten.

---

## 3. Offene Befunde

Nach jedem Lauf prüft das System das Ergebnis und speichert gefundene Probleme als **Befunde**. Das Cockpit fasst gleiche Befunde zu **Befundklassen** zusammen: gleiche Art × gleiches Feld × gleiche Kategorie. Beispiel: „Pflichtfeld fehlt · Prozessor · Laptops — 37“ heisst, bei 37 Laptops fehlt der Prozessor.

Oben stehen die Anzahl Artikel mit **blockierendem Befund**, **mit Warnung** und **mit Hinweis**.

| Art des Befunds | Bedeutung |
|---|---|
| **Pflichtfeld fehlt** | Eine Pflicht-Spezifikation dieser Kategorie ist leer |
| **Unerwünschter Text** | Text, der nicht in einen Artikel gehört, z. B. Werbeformulierungen |
| **Intake-Konflikt** | Das Ergebnis widerspricht den Angaben bei der Erfassung |
| **Standards-Verstoß** | Ein Wert hat nicht das vorgeschriebene Format |

| Schwere | Bedeutung |
|---|---|
| **Blockierend** | Keine Auto-Freigabe möglich |
| **Warnung** | Sollte korrigiert werden |
| **Hinweis** | Geringfügig |

### Eine Befundklasse bearbeiten

1. Auf den Befund (**▸**) klicken. Es erscheinen **Beispiele** und die betroffenen Artikelnummern. Klick auf eine Nummer öffnet den Artikel.
2. Zwei, drei Beispiele prüfen: Hat der Lauf einen Fehler gemacht, oder fehlt die Information tatsächlich (z. B. kein Foto vom Typenschild)?
3. **Überarbeiten (max 25)** klicken. Bis zu 25 Artikel dieser Klasse kommen in die Warteschlange. Neu bearbeitet wird nur das betroffene Feld.
4. Bei mehr als 25 Artikeln zeigt die Meldung den Rest an (z. B. „von 37, Rest beim nächsten Durchlauf“). Später erneut klicken.

Die Befunde aktualisieren sich erst, wenn die Läufe fertig sind. Die grössten Klassen stehen oben.

> Für **Überarbeiten** muss ein Benutzername gesetzt sein. Tritt dieselbe Klasse nach dem Überarbeiten wieder auf, liegt die Ursache wahrscheinlich in den Regeln oder Quellen. Melde das den Entwickler:innen.

---

## 4. Letzte KI-Ereignisse

Die letzten 15 KI-Ereignisse mit Person und Zeit: geänderte Schalter, Nachbearbeitungen, Auto-Freigaben, Fehler.
<!-- if-feature: logs -->
**Alle KI-Ereignisse →** öffnet die [Aktivitäten](/hilfe?doc=9_Aktivitaeten), gefiltert auf Thema **KI**.
<!-- end-feature -->

Die einzelnen Schritte eines Laufs (eingereiht, Ergebnis erhalten …) stehen in der Geschichte des jeweiligen Artikels, nicht hier.

---

## Probleme

| Problem | Lösung |
|---|---|
| Schalter lassen sich nicht umlegen | Du bist nicht als Admin angemeldet. In der Administration anmelden oder eine Admin-Person fragen. |
| „Dispatcher noch nicht bereit“ nach **Sweep jetzt** | Das System wurde gerade gestartet. Die Nachbearbeitung startet automatisch beim nächsten Durchlauf. |
| **zur Korrektur** sinkt nicht | **Auto-Rework** einschalten |
| Viele **Fehlgeschlagen** im Diagramm | Siehe [Fehlerbehebung](/hilfe?doc=2_Fehlerbehebung), Abschnitt **KI-Lauf bleibt hängen** |
| „Cockpit konnte nicht geladen werden.“ | Seite neu laden. Hilft das nicht: Systemstatus in der Administration prüfen. |
