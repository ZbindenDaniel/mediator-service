# Artikel

Felder und Abläufe in der Artikelansicht: gemeinsame Referenzdaten, einzelnes Exemplar, Qualität, Spezifikationen und Komponenten.

## 1. Artikelnummer und einzelnes Exemplar

Ein Artikel hat zwei Datenebenen:

| Ebene | Kennung | Was gehört dazu? |
|-------|---------|------------------|
| **Referenz** | **Artikelnummer**, zum Beispiel `000001` | Gemeinsame Daten wie Beschreibung, Hersteller, Kategorie, Referenz-Spezifikationen und Verkaufspreis |
| **Instanz** – das einzelne Exemplar | **ItemUUID**, zum Beispiel `I-000001-0001` | Behälter, Seriennummer, MAC-Adresse, Qualitätsbewertung, Bestand und eigene Spezifikationen |

Mehrere Exemplare können dieselbe Artikelnummer haben; die ItemUUID unterscheidet sie. Änderungen an der Referenz gelten für alle Exemplare mit dieser Artikelnummer. Angaben zum einzelnen Gerät bearbeitest du im Tab **Vorrat**.

## 2. Wo findest du welche Informationen?

| Tab | Inhalt |
|-----|--------|
| **Vorrat** | Daten des geöffneten Exemplars, eigene Spezifikationen, Bestandsaktionen, Umlagern und die Vorratstabelle |
| **Referenz** | Gemeinsame Beschreibungen, Kategorien, Referenz-Spezifikationen, Masse, Gewicht und Verkaufspreis; Aktionen **Bearbeiten** und **Shopartikel** |
<!-- if-feature: agentic -->
| **KI** | Status und Bedienung der KI-Anreicherung |
<!-- end-feature -->
<!-- if-feature: item-images -->
| **Bilder** | Bilder des Artikels |
<!-- end-feature -->
<!-- if-feature: item-attachments -->
| **Anhänge** | Verknüpfte Dateien und Dokumente |
<!-- end-feature -->
| **Zubehör** | Übersicht und Knopf zu den **Einzelteilen** sowie Zubehör- und Kompatibilitätsverknüpfungen |
<!-- if-feature: logs -->
| **Aktivitäten** | Protokollierte Aktionen |
<!-- end-feature -->
<!-- if-feature: item-marks -->
| **Markierung** | Eigene Markierung und Notiz sowie angezeigte Kommentare zu diesem Artikel |
<!-- end-feature -->

> Im Einfachen Modus sind **KI**, **Anhänge** und **Zubehör** ausgeblendet. Ein- und ausschalten: oben rechts auf deinen Namen klicken.

## 3. Felder im Tab Vorrat

Die Karte **dieser Artikel** beschreibt das gerade geöffnete Exemplar.

| Feld | Bedeutung |
|------|-----------|
| **ItemUUID** | Eindeutige Kennung dieses Exemplars |
| **Behälter** | Zugeordnete Box-ID; über die angezeigte ID öffnest du den Behälter |
| **Seriennummer** | Seriennummer des Geräts |
| **MAC-Adresse** | MAC-Adresse des Geräts |
| **Qualität** | Qualitätsstufe 1 bis 5; **?** = noch nicht bewertet |
<!-- if-feature: agentic -->
| **Ki Status** | Status des KI-Laufs. **Fehlgeschlagen** heisst: der KI-Lauf ist fehlgeschlagen, nicht das Gerät. |
<!-- end-feature -->
| **EAN** | Barcode-Nummer des Produkts. Gehört zur Referenz, wird aber hier angezeigt |
| **Menge** | Bestand; nur bei Einheit **Menge** |
| **Erfasst am** | Wann dieses Exemplar erfasst wurde |
| **Aktualisiert am** | Letzte Änderung an diesem Exemplar |
| **Spezifikationen** | Angaben nur zu diesem Exemplar, z. B. Verfärbungen, Kratzer, eingebauter RAM |

Darunter listet die Tabelle **Vorrat** alle Exemplare mit Lagerbestand (Spalten **UUID**, **Qualität**, **Behälter**, **Standort**, **Aktualisiert**, **Erfasst**). Klick auf eine Zeile öffnet das Exemplar. Exemplare ohne Bestand fehlen in dieser Tabelle.

### Seriennummer, MAC-Adresse oder eigene Spezifikationen ändern

1. Öffne das gewünschte Exemplar → **Vorrat** → **Bearbeiten**.
2. Im Dialog **Instanz bearbeiten** kannst du Seriennummer und MAC-Adresse ändern. Bei Mengenartikeln sind diese beiden Eingaben ausgeblendet.
3. Im Bereich **Spezifikationen** bearbeitest du Feldnamen und Werte. Mit **+ Feld hinzufügen** ergänzt du eine Zeile; mit **✕** entfernst du sie.
4. Klick auf **Speichern**.

Gespeichert werden nur Zeilen mit Feldname und Wert. Entfernte oder leere Zeilen werden gelöscht.

## 4. Felder im Tab Referenz

| Feld | Bedeutung |
|------|-----------|
| **Artikelbeschreibung** | Gemeinsame Bezeichnung des Artikels |
| **Artikelnummer** | Kennung der gemeinsamen Referenz; im Bearbeitungsformular ist sie schreibgeschützt |
| **Kurzbeschreibung** | Zusätzlicher Beschreibungstext |
| **Kategorie** | Bezeichnung der zugeordneten Unterkategorie A |
| **Unterkategorie B** | Weitere Kategoriezuordnung, sofern vorhanden |
| **Referenz-Spezifikationen** | Gemeinsame technische Merkmale; strukturierte Einträge erscheinen unter ihrem jeweiligen Feldnamen |
| **Hersteller** | Hersteller |
| **Länge (mm)**, **Breite (mm)**, **Höhe (mm)** | Abmessungen |
| **Gewicht (kg)** | Gewicht |
| **Einheit** | **Stk** für Stückartikel oder **Menge** für einen Mengenbestand |
| **Verkaufspreis** | Basispreis eines neuwertigen Geräts; der Preis pro Exemplar steht im Tab **Vorrat** |
| **CO₂ Potenzial** | Einstufung der CO₂-Einsparung; wird nur angezeigt, wenn sie nicht **Irrelevant** ist |

Diese Felder gelten für alle Exemplare mit derselben Artikelnummer. Auch die **EAN** gehört zur Referenz: ändern über **Referenz → Bearbeiten**, angezeigt im Tab **Vorrat**.

<!-- if-feature: shopware -->
Die Anzeige **Shop/Veröffentlichung** und die Aktion **Shopartikel** gehören ebenfalls zum Tab **Referenz**.
<!-- end-feature -->

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

1. Öffne **Vorrat → Neu bewerten**. Bei fehlender Bewertung steht zusätzlich **Jetzt bewerten** zur Verfügung. Geräte mit Komponentenvorlage bewertest du stattdessen über **Vorrat → Einzelteile**.
2. Beantworte die Fragen zum Zustand und, je nach Kategorie, zu Komponenten und weiteren Geräteeigenschaften. Bereits gespeicherte Antworten werden beim erneuten Öffnen geladen.
3. Die **Vorschau** zeigt die aus den aktuellen Antworten abgeleitete Stufe.
4. Klick auf **Weiter →**, um die Bewertung zu speichern.

Fragen können ausgelassen werden. Jede beantwortete Frage fliesst gewichtet in einen Prozentwert ein. Eine einzelne schlechte Antwort senkt den Wert, bestimmt die Stufe aber nicht allein.

Die Stufe richtet sich nach dem Mindestwert, der sicher erreicht ist: ab 95 % **5**, ab 85 % **4**, ab 60 % **3**, ab 40 % **2**, darunter **1**. Sind zu viele Fragen offen, ist die Spanne zu gross und es wird noch keine Stufe berechnet (Anzeige **?**).

**Ausnahme:** Bei schweren Mängeln (K.-o.-Kriterium) wird die Stufe nach oben begrenzt, auch wenn alle anderen Antworten gut sind.

Manche Antworten erzeugen zusätzlich Spezifikationen des Exemplars, z. B. **Verfärbungen** oder **Kratzer**. Diese stehen getrennt von der Qualitätsstufe.

## 6. Wie funktionieren Spezifikationen?

| Art | Wo sichtbar? | Wie bearbeiten? |
|-----|--------------|-----------------|
| **Referenz-Spezifikationen** | **Referenz**, als einzelne Merkmale oder als Feld **Spezifikationen** bei älteren Textdaten | **Referenz → Bearbeiten → Spezifikationen** |
| **Spezifikationen des Exemplars** | **Vorrat → dieser Artikel → Spezifikationen**, soweit Einträge vorhanden sind | **Vorrat → Bearbeiten**; bestimmte Qualitätsantworten können diese Angaben ebenfalls liefern |

**Beispiel:** Eine gemeinsame Prozessorangabe gehört zu den Referenzdaten. Der tatsächlich erfasste Zustand eines Exemplars, etwa seine Kratzer, gehört zu dessen eigenen Spezifikationen.

### Gemeinsame Spezifikationen bearbeiten

1. Öffne **Referenz → Bearbeiten**.
2. Im Bereich **Spezifikationen** kannst du die vorhandenen Werte ändern.
3. Bei strukturierten Daten ergänzt du über **Neuer Schlüssel** und **+** ein Merkmal und trägst anschliessend seinen Wert ein. Mit **−** entfernst du einen Eintrag.
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

Die Vorlage legt fest, welche Angaben erwartet werden. Ausstattung und Zustand prüfst du am Gerät selbst. Contract-Dateien musst du für die normale Arbeit nicht bearbeiten.

## 8. Einzelteile und Komponenten

Geräte mit einer Komponentenvorlage nimmst du auf der Seite **Einzelteile** auseinander. Du öffnest sie im Tab **Vorrat** über **Einzelteile** oder im Tab **Zubehör** über **Einzelteile öffnen**. Links siehst du den Aufbau des Geräts, rechts die Bewertung des gewählten Teils. Dort hältst du fest, welche Teile vorhanden sind, bewertest sie einzeln und entnimmst sie.

> **Entnehmen** bei einem Einzelteil legt es in einen Behälter. **Entnehmen** im Tab **Vorrat** eines Stückartikels bucht dagegen den geöffneten Artikel aus dem Bestand aus. Bei Mengenartikeln heisst die Bestandsaktion **Menge reduzieren**.

Den ganzen Ablauf erklärt [Ersatzteile erfassen](/hilfe?doc=4_Ersatzteile-erfassen). Das Umlagern findest du in [Erste Schritte](/hilfe?doc=1_Erste-Schritte) unter **Artikel und Behälter umlagern**.
