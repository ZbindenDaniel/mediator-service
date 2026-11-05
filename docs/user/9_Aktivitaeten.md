# Aktivitäten
<!-- feature: logs -->

Das System speichert jede Aktion (umlagern, bearbeiten, drucken, KI-Läufe, Exporte) mit Person, Aktion und Zeit. In den Aktivitäten siehst du z. B., wer einen Artikel verschoben hat oder welche Fehler in der Nacht aufgetreten sind.

---

## Wo

| Ort | Inhalt |
|---|---|
| **Log-Symbol** in der Navigation | **Letzte Aktivitäten** im ganzen System, mit Filtern |
| Artikel → Tab **Aktivitäten** | Die vollständige Geschichte dieses einen Artikels |
| Behälter/Regal → Tab **Aktivitäten** | Was in und mit diesem Behälter passiert ist |
<!-- if-feature: agentic -->
| [KI-Cockpit](/hilfe?doc=10_KI-Cockpit) → **Letzte KI-Ereignisse** | Nur die KI-Ereignisse |
<!-- end-feature -->

---

## Aufbau der Liste

Spalten: **Typ** (Artikel, Behälter oder Sammelaktion), **ID**, **Artikelbezeichnung**, **Akteur** (Person), **Aktion** und **Datum**. Klick auf eine Artikel- oder Behälter-Zeile öffnet den Eintrag.

- **Tagesüberschriften** (**Heute**, **Gestern**, dann mit Datum) gliedern die Liste.
- **Zusammengefasste Zeilen:** Führt dieselbe Person dieselbe Aktion mindestens dreimal innerhalb von 10 Minuten aus, erscheint eine Zeile mit **×Anzahl**, z. B. „Verschoben ×12“. **▸** klappt die einzelnen Einträge auf.
- **Farbiger Rand links** zeigt die Stufe (Legende über der Liste):

| Stufe | Bedeutung |
|---|---|
| **Fehler** (rot, leicht hinterlegt) | Eine Aktion ist fehlgeschlagen |
| **Wichtig** (orange) | Bewegungen und Eingriffe: verschoben, entnommen, gelöscht, KI-Ergebnis abgelehnt, Schalter umgelegt |
| **Info** (hellblau) | Normale Arbeit: anlegen, bearbeiten, drucken |
| **Technisch** (blass) | Einzelschritte von Hintergrundjobs, nur in der Ansicht **Alles** |

Die Stufe steht auch im Tooltip der Zeile.

---

## Filtern

### Detailgrad

| Knopf | Zeigt |
|---|---|
| **Wichtig** | Nur Stufen Wichtig und Fehler |
| **Standard** | Alles ausser technischen Einzelereignissen (voreingestellt) |
| **Alles** | Inklusive technischer Einzelereignisse, z. B. Shop-Sync pro Artikel |

Sammelaktionen (z. B. 200 Artikel in den Shop) erscheinen in **Standard** als eine Zeile. Die Einträge pro Artikel stehen unter **Alles** und im Tab **Aktivitäten** des Artikels.

### Thema

Die Knöpfe **Logistik**, **Daten**, **Export**, **Druck** und **KI** filtern nach Thema. Mehrere gleichzeitig sind möglich. Erneuter Klick hebt den Filter auf.

### Suche und Akteur

- Feld **Artikelnummer, UUID, Box-ID oder Regal-ID**: alle Einträge zu diesem Artikel oder Behälter.
- Feld **Akteur**: nur Einträge dieser Person. Ein Teil des Namens genügt.
- Mit **Enter** oder **Suchen** anwenden. **✕ Zurücksetzen** löscht alle Filter.

Die Filter stehen in der Adresszeile. Eine gefilterte Ansicht lässt sich deshalb als Link verschicken.

### Mehr laden

Die Liste lädt 100 Einträge auf einmal. **Weitere 100 laden** lädt ältere Einträge. **Ende der Liste** heisst: Es gibt keine älteren Einträge.

---

## Beispiele

**Wo ist der Artikel hin?** Artikel öffnen → Tab **Aktivitäten** → der letzte Eintrag **Verschoben** zeigt Ziel und Person.

**Wer hat das geändert?** Artikelnummer ins Suchfeld, Thema **Daten**.

**Fehler in der Nacht?** Detailgrad **Wichtig**, unter **Heute** nach roten Zeilen suchen.

**Was hat Person X heute gemacht?** Namen ins Feld **Akteur**.

> Akteur **[?]** heisst: Die Aktion wurde ohne Benutzernamen ausgeführt. Setz deinen Namen (oben rechts), damit deine Aktionen dir zugeordnet werden.
