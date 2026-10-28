# Artikel

Diese Seite erklärt die Felder und Abläufe in der Artikeldetailansicht: gemeinsame Referenzdaten, das einzelne Exemplar, Qualität, Spezifikationen und Komponenten.

## 1. Artikelnummer und einzelnes Exemplar

Ein Artikel hat zwei Datenebenen:

| Ebene | Kennung | Was gehört dazu? |
|-------|---------|------------------|
| **Referenz** | **Artikelnummer**, zum Beispiel `000001` | Gemeinsame Daten wie Beschreibung, Hersteller, Kategorie, Referenz-Spezifikationen und Verkaufspreis |
| **Instanz** – das einzelne Exemplar | **ItemUUID**, zum Beispiel `I-000001-0001` | Behälter, Seriennummer, MAC-Adresse, Qualitätsbewertung, Bestand und eigene Spezifikationen |

Mehrere Exemplare können dieselbe Artikelnummer haben. Ihre ItemUUIDs unterscheiden sie voneinander. Eine Änderung an den Referenzdaten betrifft die gemeinsame Referenz dieser Exemplare. Angaben zum konkreten Gerät bearbeitest du im Tab **Vorrat**.

## 2. Wo findest du welche Informationen?

| Tab | Inhalt |
|-----|--------|
| **Vorrat** | Daten des geöffneten Exemplars, eigene Spezifikationen, Bestandsaktionen, Umlagern und die Vorratstabelle |
| **Referenz** | Gemeinsame Beschreibungen, Kategorien, Referenz-Spezifikationen, Maße, Gewicht und Verkaufspreis; Aktionen **Bearbeiten** und **Shopartikel** |
| **KI** | Status und Bedienung der KI-Anreicherung |
| **Bilder** | Bilder des Artikels |
| **Anhänge** | Verknüpfte Dateien und Dokumente |
| **Zubehör** | Komponenten sowie Zubehör- und Kompatibilitätsverknüpfungen |
| **Aktivitäten** | Protokollierte Aktionen |
| **Markierung** | Eigene Markierung und Notiz sowie angezeigte Kommentare zu diesem Artikel |

> Im vereinfachten Modus sind **KI**, **Anhänge** und **Zubehör** ausgeblendet. Den Modus kannst du über die Benutzereinstellungen ändern, die sich per Doppelklick auf deinen Namen im Header öffnen.

## 3. Felder im Tab Vorrat

Die Karte **dieser Artikel** beschreibt das gerade geöffnete Exemplar.

| Feld | Bedeutung |
|------|-----------|
| **ItemUUID** | Eindeutige Kennung dieses Exemplars |
| **Behälter** | Zugeordnete Box-ID; über die angezeigte ID öffnest du den Behälter |
| **Seriennummer** | Hinterlegte Seriennummer des Geräts |
| **MAC-Adresse** | Hinterlegte MAC-Adresse des Geräts |
| **Qualität** | Qualitätsstufe von 1 bis 5; **?** steht für einen fehlenden beziehungsweise unbekannten Wert |
| **Ki Status** | Zustand der KI-Verarbeitung. **Fehlgeschlagen** bezieht sich hier auf den KI-Vorgang. |
| **EAN** | Produktkennung aus den gemeinsamen Referenzdaten, auch wenn sie hier im Vorrat angezeigt wird |
| **Menge** | Hinterlegter Bestand bei Einheit **Menge**; diese Zeile erscheint für Mengenartikel |
| **Erfasst am** | Erfassungszeitpunkt dieses Exemplars |
| **Aktualisiert am** | Hinterlegter Aktualisierungszeitpunkt dieses Exemplars |
| **Spezifikationen** | Zusätzliche Angaben zu diesem Exemplar, soweit vorhanden, etwa Verfärbungen, Kratzer oder eine erfasste RAM-Ausstattung |

Eine leere Angabe wird als Platzhalter dargestellt. Die darunterliegende Tabelle **Vorrat** zeigt Instanzen mit Lagerbestand und die Spalten **UUID**, **Qualität**, **Behälter**, **Standort**, **Aktualisiert** und **Erfasst**. Klick auf eine Zeile, um das jeweilige Exemplar zu öffnen. Instanzen ohne Lagerbestand werden in dieser Tabelle ausgeblendet.

### Seriennummer, MAC-Adresse oder eigene Spezifikationen ändern

1. Öffne das gewünschte Exemplar → **Vorrat** → **Bearbeiten**.
2. Im Dialog **Instanz bearbeiten** kannst du Seriennummer und MAC-Adresse ändern. Bei Mengenartikeln sind diese beiden Eingaben ausgeblendet.
3. Im Bereich **Spezifikationen** bearbeitest du Feldnamen und Werte. Mit **+ Feld hinzufügen** ergänzt du eine Zeile; mit **✕** entfernst du sie.
4. Klick auf **Speichern**.

Gespeichert werden Spezifikationszeilen mit ausgefülltem Feldnamen und Wert. Entfernte oder geleerte Zeilen werden aus den Spezifikationen dieses Exemplars entfernt.

## 4. Felder im Tab Referenz

| Feld | Bedeutung |
|------|-----------|
| **Artikelbeschreibung** | Gemeinsame Bezeichnung des Artikels |
| **Artikelnummer** | Kennung der gemeinsamen Referenz; im Bearbeitungsformular ist sie schreibgeschützt |
| **Kurzbeschreibung** | Zusätzlicher Beschreibungstext |
| **Kategorie** | Bezeichnung der zugeordneten Unterkategorie A |
| **Unterkategorie B** | Weitere Kategoriezuordnung, sofern vorhanden |
| **Referenz-Spezifikationen** | Gemeinsame technische Merkmale; strukturierte Einträge erscheinen unter ihrem jeweiligen Feldnamen |
| **Hersteller** | Hinterlegter Hersteller |
| **Länge (mm)**, **Breite (mm)**, **Höhe (mm)** | Hinterlegte Abmessungen in Millimetern |
| **Gewicht (kg)** | Hinterlegtes Gewicht in Kilogramm |
| **Einheit** | **Stk** für Stückartikel oder **Menge** für einen Mengenbestand |
| **Verkaufspreis** | Hinterlegter Verkaufspreis |
| **CO₂ Potenzial** | Berechnete Potenzialanzeige, wenn für den geöffneten Artikel eine Einstufung außer **Irrelevant** vorliegt |

Die Felder der Referenz stehen allen Exemplaren mit dieser Artikelnummer gemeinsam zur Verfügung. **EAN** wird ebenfalls an der Referenz gespeichert und über **Referenz → Bearbeiten** geändert; die Detailansicht zeigt sie im Tab **Vorrat**.

Die Anzeige **Shop/Veröffentlichung** und die Aktion **Shopartikel** gehören ebenfalls zum Tab **Referenz**.

## 5. Qualität bewerten und verstehen

| Wert | Bezeichnung |
|------|-------------|
| **1** | Ersatzteil |
| **2** | Upcycling |
| **3** | Ok |
| **4** | Gut |
| **5** | Neuwertig |
| **?** | Kein bekannter Qualitätswert |

### So bewertest du ein Exemplar

1. Öffne **Vorrat → Neu bewerten**. Bei fehlender Bewertung steht zusätzlich **Jetzt bewerten** zur Verfügung.
2. Beantworte die Fragen zum Zustand und, je nach Kategorie, zu Komponenten und weiteren Geräteeigenschaften. Bereits gespeicherte Antworten werden beim erneuten Öffnen geladen.
3. Die **Vorschau** zeigt die aus den aktuellen Antworten abgeleitete Stufe.
4. Klick auf **Weiter →**, um die Bewertung zu speichern. Bei einer Stufe bis einschließlich 3 erscheint danach ein Hinweis zum Katalogisieren von Einzelteilen.

Die Fragen können ausgelassen werden. Die Berechnung berücksichtigt beantwortete, aktuell sichtbare Fragen, denen eine Qualitätswirkung zugeordnet ist. **Der niedrigste dieser Werte bestimmt die Stufe.** Ohne eine solche Antwort wird bei der Bewertung die Standardstufe **3 – Ok** verwendet. Ein angezeigtes **?** bedeutet dagegen, dass noch kein bekannter Qualitätswert vorliegt.

**Beispiel aus den allgemeinen Fragen:** **Verfärbungen oder Kleberückstände? → Stark** ergibt den Wert 3, **Kratzer? → Keine** den Wert 5. Wenn keine weitere Antwort einen niedrigeren Wert vorgibt, ist das Ergebnis **3 – Ok**.

Antworten können außerdem Spezifikationen wie **Verfärbungen** und **Kratzer** für das einzelne Exemplar liefern. Die Qualitätsstufe und diese Merkmale werden deshalb getrennt angezeigt.

## 6. Wie funktionieren Spezifikationen?

| Art | Wo sichtbar? | Wie bearbeiten? |
|-----|--------------|-----------------|
| **Referenz-Spezifikationen** | **Referenz**, als einzelne Merkmale oder als Feld **Spezifikationen** bei älteren Textdaten | **Referenz → Bearbeiten → Spezifikationen** |
| **Spezifikationen des Exemplars** | **Vorrat → dieser Artikel → Spezifikationen**, soweit Einträge vorhanden sind | **Vorrat → Bearbeiten**; bestimmte Qualitätsantworten können diese Angaben ebenfalls liefern |

**Beispiel:** Eine gemeinsame Prozessorangabe gehört zu den Referenzdaten. Der tatsächlich erfasste Zustand eines Exemplars, etwa seine Kratzer, gehört zu dessen eigenen Spezifikationen.

### Gemeinsame Spezifikationen bearbeiten

1. Öffne **Referenz → Bearbeiten**.
2. Im Bereich **Spezifikationen** kannst du die vorhandenen Werte ändern.
3. Bei strukturierten Daten ergänzt du über **Neuer Schlüssel** und **+** ein Merkmal und trägst anschließend seinen Wert ein. Mit **−** entfernst du einen Eintrag.
4. Klick auf **Speichern**.

Bei älteren, als Text gespeicherten Angaben zeigt das Formular stattdessen ein Textfeld. Beim Speichern können erwartete Merkmale aus der Kategorievorlage als leere Felder ergänzt werden. Ein leeres Feld enthält noch keinen bestätigten Wert.

### Eigene Angaben nach einer Bewertung prüfen

Eine erneute Qualitätsbewertung kann die aus beantworteten Fragen abgeleiteten Merkmale des Exemplars überschreiben. Ausgelassene Antworten löschen früher gespeicherte Merkmale nicht automatisch. Falls eine alte Angabe entfernt werden soll, prüfe und korrigiere sie über **Vorrat → Bearbeiten**.

## 7. Was sind Contracts?

**Contracts** sind die hinterlegten Vorlagen und Regeln für die Erfassung. Sie bestimmen, welche Fragen, erwarteten Spezifikationen und Komponenten für eine Unterkategorie verfügbar sind.

| Vorlage | Aufgabe |
|---------|---------|
| **Qualität** | Allgemeine und kategoriespezifische Zustandsfragen; Antworten können Qualitätswerte und Spezifikationen vorgeben |
| **Spezifikationen** | Erwartete Merkmale der Referenz, zum Beispiel **Prozessor** bei Laptops; die Vorlage unterscheidet erforderliche und gewünschte Merkmale für die Vollständigkeitsprüfung |
| **Komponenten / Assembly** | Bauteilpositionen, zugehörige Fragen und Regeln zur Erfassung als verknüpfte Einzelteile |

Die allgemeinen Qualitätsfragen werden mit den verfügbaren Komponenten- und Kategoriefragen kombiniert. Daher sieht die Bewertung je nach Unterkategorie unterschiedlich aus. Komponenten erscheinen nur, wenn eine passende Komponentenvorlage vorhanden ist.

Die Vorlage beschreibt, welche Angaben erwartet werden. Die tatsächliche Ausstattung und den Zustand des Geräts musst du anhand des Exemplars prüfen. Für die normale Bedienung musst du keine Contract-Dateien bearbeiten.

## 8. Einzelteile und Komponenten

Öffne **Zubehör → Komponenten**. Wenn für die Unterkategorie eine Vorlage hinterlegt ist, siehst du dort ihre Bauteilpositionen, zum Beispiel Akku oder Arbeitsspeicher.

| Symbol | Bedeutung |
|--------|-----------|
| **⬜** | Unbekannt: noch keine passende Angabe und kein verknüpfter Bauteilartikel |
| **◎** | Vorhanden, aber noch nicht als Bauteilartikel katalogisiert |
| **✕** | Als nicht vorhanden angegeben |
| **◉** | Als eigener Artikel katalogisiert und noch im Gerät |
| **○** | Katalogisiertes Bauteil wurde einem Behälter zugeordnet |

Je nach Position kannst du Angaben direkt in der Komponentenliste ändern. Nicht jede Position bietet eine Erfassung als Artikel an. Beim Laptop wird **SSD / HDD** derzeit über Spezifikationsangaben erfasst; an dieser Position gibt es keinen **Erfassen**-Knopf.

### Ein Bauteil als eigenen Artikel erfassen

1. Klick bei einer dafür vorgesehenen Position auf **Erfassen**. Der Knopf kann die bekannte Ausstattung im Text mit anzeigen.
2. Wenn bereits eine passende Referenzverknüpfung vorhanden ist, wird diese direkt verwendet. Andernfalls wählst du im geöffneten Fenster einen Vorschlag aus oder suchst eine Referenz im Suchfeld.
3. Falls eine neue Referenz nötig ist, bietet das Fenster **+ Neu anlegen** und anschließend **Anlegen & katalogisieren**.
4. Das erfasste Bauteil erhält eine eigene Artikelinstanz und bleibt zunächst dem Gerät zugeordnet; die Position zeigt **◉**.

**Entnehmen:** Bei einem katalogisierten Bauteil öffnet **Entnehmen** die Zielauswahl zum Umlagern. Wähle einen Behälter und bestätige mit **Verschieben**, oder benutze **In neuen Behälter verschieben**. Lege das ausgebaute Teil auch physisch in diesen Behälter. Über diesen Ablauf wird das Quellgerät als unvollständig mit Qualität **1 – Ersatzteil** markiert.

**Lösen:** Solange das katalogisierte Bauteil noch im Gerät ist, entfernt **Lösen** nach Bestätigung seine Verknüpfung und löscht die dafür angelegte Artikelinstanz. Bei einem bereits einem Behälter zugeordneten Bauteil steht diese Aktion nicht mehr zur Verfügung.

> **Entnehmen** bei einer Komponente wählt ihren Lagerbehälter. **Entnehmen** im Tab **Vorrat** eines Stückartikels bucht dagegen den geöffneten Artikel aus dem Bestand aus. Bei Mengenartikeln heißt die Bestandsaktion **Menge reduzieren**.

Den Umlagerungsablauf findest du in [Erste Schritte, Abschnitt 6](/hilfe?doc=1_Erste-Schritte). Weitere Hinweise stehen unter [Ersatzteile erfassen](/hilfe?doc=4_Ersatzteile-erfassen).
