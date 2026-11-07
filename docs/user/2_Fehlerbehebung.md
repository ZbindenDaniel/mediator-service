# Fehlerbehebung

Häufige Probleme und was du selbst prüfen kannst. Geh die Schritte der Reihe nach durch und prüf nach jedem Schritt, ob das Problem behoben ist.

---

<!-- if-feature: printing -->
## Drucker druckt nicht

### Anzeichen
- Meldung „Kein Drucker konfiguriert“ nach **Label drucken**.
- Es kommt kein Label, obwohl kein Fehler angezeigt wird.
- Statt **Gesendet an Drucker** erscheint **Label als PDF öffnen**.

### Prüfen

1. **Drucker an?** Gerät eingeschaltet, keine Fehleranzeige (rotes Lämpchen, Papierstau).
2. **Etiketten eingelegt?** Druckerfach öffnen, Rolle prüfen.
3. **Verbindung?** Kabel bzw. WLAN-Anzeige prüfen. Drucker aus- und wieder einschalten.
4. **Ausweichen:** **Label als PDF öffnen** klicken und das PDF über einen anderen Drucker ausdrucken.
5. **Melden:** Gib der Systemadministration diese Angaben:
   - welches Label (Artikel oder Behälter),
   - seit wann das Problem besteht,
   - Fehlermeldung (Screenshot).

Admins finden den Status in der Administration unter **Druckwarteschlange**.

---
<!-- end-feature -->

## Medienspeicher (WebDAV) nicht erreichbar

WebDAV ist der Netzwerkspeicher für Bilder und Dokumente.

### Anzeichen
- Bilder lassen sich nicht hochladen.
- Vorhandene Bilder werden nicht angezeigt.
<!-- if-feature: erp-sync -->
- Beim ERP-Sync erscheint ein Fehler zur Medienübertragung.
<!-- end-feature -->

### Prüfen

1. **Netzwerk:** Ist dein Gerät im Firmennetz? Teste einen anderen internen Dienst.
2. **2–3 Minuten warten** und erneut versuchen. Nach einem Neustart ist der Speicher kurz nicht erreichbar.
3. **Melden**, wenn es länger als 5 Minuten dauert. Angaben: seit wann, was du tun wolltest (z. B. Bild hochladen), Fehlermeldung.

> Artikeldaten (Beschreibung, Spezifikationen, Preis) werden auch ohne WebDAV gespeichert. Bilder und Dateien nicht: Ein fehlgeschlagener Upload ist verloren, es gibt keine Zwischenspeicherung. Lade das Bild erneut hoch, sobald WebDAV wieder erreichbar ist.

---

<!-- if-feature: item-images -->
## Bilder werden nicht angezeigt

### Prüfen

1. **Seite neu laden:** `F5` oder `Strg + R` (Windows) bzw. `Cmd + R` (Mac).
2. **Anderes Gerät oder anderen Browser** testen. Erscheinen die Bilder dort, liegt das Problem am ersten Browser (meist am Cache).
3. **Browser-Cache leeren:**
   - Chrome: `Strg + Umschalt + Entf` → „Bilder und Dateien im Cache“ → „Daten löschen“
   - Firefox: `Strg + Umschalt + Entf` → „Cache“ → „Jetzt löschen“
4. **WebDAV prüfen:** siehe **Medienspeicher (WebDAV) nicht erreichbar**.
5. **Melden**, wenn Bilder dauerhaft fehlen. Angaben: Artikelnummer, Zeitpunkt des letzten Uploads.

---
<!-- end-feature -->

## Veraltete Daten im Browser

### Anzeichen
- Ein Artikel zeigt alte Werte, oder eine Liste ist leer, obwohl Daten vorhanden sind.
- Ein anderes Gerät zeigt andere Daten.

### Prüfen

1. **Neu laden ohne Cache:** `Strg + Umschalt + R` (Windows/Linux) bzw. `Cmd + Umschalt + R` (Mac).
2. **Cache leeren**, wenn das nicht hilft:
   - Chrome: `Strg + Umschalt + Entf` → „Bilder und Dateien im Cache“ → „Daten löschen“
   - Firefox: `Strg + Umschalt + Entf` → „Cache“ → „Jetzt löschen“
3. **Privates Fenster** testen. Stimmen die Daten dort, liegt es am Cache oder an einer Browser-Erweiterung.

---

## Seite lädt nicht oder reagiert nicht

### Anzeichen
- Die App lädt nicht fertig oder bleibt leer.
- Knöpfe reagieren nicht.

### Prüfen

1. **Netzwerk:** Ist dein Gerät verbunden?
2. **Anderen Browser** testen (Chrome oder Firefox).
3. **Browser-Konsole:** `F12` → Tab „Konsole“. Rote Fehlermeldungen als Screenshot sichern.
4. **Melden**, wenn die App weiterhin nicht reagiert. Wahrscheinlich ist der Server nicht erreichbar. Angaben: Screenshot, ungefährer Zeitpunkt.

---

<!-- if-feature: agentic -->
## KI-Lauf bleibt hängen

### Anzeichen
- Im Tab **KI** steht seit Minuten „Wird ausgeführt…“ ohne Änderung.
- Der Lauf bleibt lange in der Warteschlange oder wechselt nicht zu **Review**.

### Prüfen

1. **Warten:** Ein Lauf dauert einige Minuten. Sind viele Läufe in der Warteschlange, dauert es länger.
2. **Seite neu laden** (`F5`). Der Status aktualisiert sich nicht immer automatisch.
3. **Neu starten:** Läuft der Lauf nach 10 Minuten noch, im Tab **KI** **Abbrechen** und dann **Wiederholen**. Hängende Läufe werden nach einiger Zeit auch automatisch abgebrochen.
4. **Melden**, wenn Neustarts nicht helfen. Angaben: Artikelnummer, seit wann.

**Ergebnis falsch, aber nicht hängend?** Nicht neu starten. Im **Review** korrigieren und mit Feedback **Ablehnen**, oder einzelne Felder mit **KI Überarbeitung** neu erstellen lassen. Hat ein Lauf korrekte Daten überschrieben: Tab **KI** → **Verlauf** → frühere Version wiederherstellen.

---
<!-- end-feature -->

## Falsche Eingabe korrigieren

Die meisten Aktionen lassen sich korrigieren.

### Falscher Lagerort

Artikel oder Behälter wurde an den falschen Ort gebucht. Lösung: nochmals umlagern.

1. Artikel öffnen → Tab **Vorrat** → **Umlagern**.
2. Richtigen Behälter wählen.
3. **Verschieben**.

Behälter: Behälter öffnen → **Umlagern** → richtiges Regal wählen.

<!-- if-feature: logs -->
> Alle Umlagerungen stehen in den [Aktivitäten](/hilfe?doc=9_Aktivitaeten), mit Person und Zeit.
<!-- end-feature -->

**Wo liegt der Artikel wirklich?** Öffne den Behälter oder das Regal: Dort siehst du alle zugeordneten Artikel und kannst vergleichen.

---

### Falsche Artikeldaten

1. Artikel öffnen → Tab **Referenz** → **Bearbeiten**.
2. Felder korrigieren.
3. **Speichern**.

> Ändere eine Artikelnummer nur, wenn sie falsch ist und der Artikel noch nicht ins ERP übertragen wurde. Im Zweifel vorher nachfragen.

---

<!-- if-feature: printing -->
### Falsches Label aufgeklebt oder Label fehlt

1. Richtigen Artikel öffnen → Tab **Vorrat** → **Label drucken**.
2. Neues Label aufkleben. Altes Label entfernen oder unleserlich machen.

---
<!-- end-feature -->

### Artikel versehentlich gelöscht

Löschen kannst du nicht selbst rückgängig machen. Melde es sofort der Systemadministration, mit Artikelnummer. Löschungen werden protokolliert; eine Wiederherstellung aus dem Backup ist möglich.

> Lösch nur Artikel, die es nicht gibt (z. B. doppelt erfasst).
<!-- if-feature: shopware -->
> Artikel, die nicht mehr verkauft werden sollen, setzt du im Shopstatus auf „kein Shopartikel“. Sie bleiben dann im System.
<!-- end-feature -->

---

<!-- if-feature: agentic -->
### KI-Lauf hat falsche Werte eingetragen

- **Vor der Freigabe:** Im Review korrigieren oder **Ablehnen**.
- **Nach der Freigabe:** Tab **Referenz** → **Bearbeiten** und Felder korrigieren. Oder im Tab **KI** einen neuen Lauf starten.

---
<!-- end-feature -->

<!-- if-feature: erp-sync -->
### Falsche Daten ins ERP übertragen

Sind die Daten im System inzwischen korrigiert, Artikel erneut auswählen und mit **Kivi Sync 🥝** übertragen. Das überschreibt die vorherige Übertragung. Muss etwas direkt im ERP geändert werden, die ERP-verantwortliche Person kontaktieren.

---
<!-- end-feature -->

## Problem nicht gelöst

Melde es der **Systemadministration** mit:

1. **Screenshot** der Fehlermeldung oder des Bildschirms,
2. **Artikelnummer** oder **Box-ID**,
3. **Datum und Uhrzeit**.
