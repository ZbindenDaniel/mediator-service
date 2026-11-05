# Aktivitäten
<!-- feature: logs -->

Alles, was im System passiert — umlagern, bearbeiten, drucken, KI-Läufe, Exporte — wird mit **wer**, **was** und **wann** protokolliert. Die Aktivitäten beantworten Fragen wie: *Wer hat diesen Laptop verschoben?* oder *Was ist gestern Abend schiefgelaufen?*

---

## Wo finde ich die Aktivitäten?

| Wo | Was du siehst |
|---|---|
| **Log-Symbol** in der Navigation | **Letzte Aktivitäten** im ganzen System, mit Filtern |
| Artikel → Tab **Aktivitäten** | Die vollständige Geschichte dieses einen Artikels |
| Behälter/Regal → Tab **Aktivitäten** | Was in und mit diesem Behälter passiert ist |
<!-- if-feature: agentic -->
| [KI-Cockpit](/hilfe?doc=10_KI-Cockpit) → **Letzte KI-Ereignisse** | Nur die KI-Ereignisse |
<!-- end-feature -->

---

## Die Liste lesen

Jede Zeile hat die Spalten **Typ** (Artikel, Behälter oder Sammelaktion), **ID**, **Artikelbezeichnung**, **Akteur** (wer), **Aktion** (was) und **Datum**. Ein Klick auf eine Artikel- oder Behälter-Zeile öffnet den Eintrag.

- **Tagesüberschriften** (**Heute**, **Gestern**, dann mit Datum) gliedern die Liste.
- **Zusammengefasste Zeilen:** Macht dieselbe Person mindestens dreimal kurz hintereinander (innerhalb von 10 Minuten) dasselbe, steht das als eine Zeile mit **×Anzahl** da, z. B. „Verschoben ×12“. Klick auf **▸**, um die einzelnen Einträge aufzuklappen.
- **Farbiger Rand links** zeigt die Wichtigkeit (die Legende steht über der Liste):

| Stufe | Bedeutung |
|---|---|
| **Fehler** (rot, leicht hinterlegt) | Etwas ist schiefgegangen — anschauen |
| **Wichtig** (orange) | Bewegungen und Eingriffe: verschoben, entnommen, gelöscht, KI-Ergebnis abgelehnt, Schalter umgelegt |
| **Info** (hellblau) | Normale Arbeit: anlegen, bearbeiten, drucken |
| **Technisch** (blass) | Einzelschritte von Hintergrundjobs, nur in der Ansicht **Alles** |

Die Stufe steht auch im Tooltip, wenn du mit der Maus über die Zeile fährst.

---

## Filtern

### Detailgrad

| Knopf | Zeigt |
|---|---|
| **Wichtig** | Nur wichtige Ereignisse und Fehler — der schnelle Blick „ist was passiert?“ |
| **Standard** | Alles ausser technischen Einzelereignissen (voreingestellt) |
| **Alles** | Inklusive technischer Einzelereignisse, z. B. Shop-Sync pro Artikel |

Sammelaktionen (z. B. 200 Artikel in den Shop) stehen in **Standard** als *eine* Zeile; die Schritte pro Artikel findest du unter **Alles** oder in der Geschichte des Artikels.

### Thema

Die Knöpfe **Logistik**, **Daten**, **Export**, **Druck** und **KI** grenzen auf ein Thema ein. Mehrere gleichzeitig sind möglich; nochmal klicken schaltet ein Thema wieder aus.

### Suche und Akteur

- Feld **Artikelnummer, UUID, Box-ID oder Regal-ID** — findet alles zu diesem Artikel oder Behälter.
- Feld **Akteur** — nur Einträge dieser Person (Teil des Namens reicht).
- Mit **Enter** oder **Suchen** anwenden. **✕ Zurücksetzen** löscht alle Filter.

Die Filter stehen in der Adresszeile — du kannst eine gefilterte Ansicht also als Link an Kolleg:innen schicken.

### Mehr laden

Die Liste lädt jeweils 100 Einträge. Unten steht, wie viele geladen sind; mit **Weitere 100 laden** gehst du weiter zurück. Steht dort **Ende der Liste**, gibt es nichts Älteres mehr.

---

## Typische Fragen

**Wo ist der Artikel hin?** Artikel öffnen → Tab **Aktivitäten** → der letzte Eintrag **Verschoben** zeigt Ziel und Person.

**Wer hat das geändert?** Artikelnummer ins Suchfeld, Thema **Daten**.

**Ist heute Nacht etwas schiefgelaufen?** Detailgrad **Wichtig** und nach roten Zeilen unter **Heute** schauen.

**Was hat Person X heute gemacht?** Namen ins Feld **Akteur**.

> Steht als Akteur **[?]**, wurde die Aktion ohne Benutzernamen ausgeführt. Setz deinen Namen (Klick auf deinen Namen oben rechts), damit deine Arbeit dir zugeordnet wird.
