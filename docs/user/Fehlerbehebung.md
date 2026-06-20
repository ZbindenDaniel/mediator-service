# Fehlerbehebung

Hier findest du Hilfe bei den häufigsten Problemen. Geh die Schritte der Reihe nach durch und prüf nach jedem Schritt, ob's wieder funktioniert.

---

## 1. Drucker funktioniert nicht

### Symptome
- Die Meldung „Kein Drucker konfiguriert" erscheint nach dem Drucken.
- Das Etikett wird nicht gedruckt, obwohl kein Fehler angezeigt wird.
- Die Vorschau erscheint, aber der Druckauftrag kommt nicht an.

### Was du prüfen kannst

**Schritt 1 — Ist der Drucker eingeschaltet?**
Schau, ob der Etikettendrucker an ist und keine Fehleranzeige hat (rotes Lämpchen, Papierstau).

**Schritt 2 — Papier und Etikettenrolle**
Öffne das Druckerfach und prüf, ob Etiketten eingelegt sind und die Rolle richtig sitzt.

**Schritt 3 — Netzwerkverbindung**
Stell sicher, dass der Drucker mit dem Netzwerk verbunden ist (Kabel oder WLAN-Anzeige leuchtet). Versuch, den Drucker neu zu starten.

**Schritt 4 — Druckervorschau nutzen**
Wenn der Drucker nicht erreichbar ist, erzeugt das System automatisch eine Vorschau-Datei. Lad sie herunter und drucke manuell über deinen Computer.

**Schritt 5 — Sysadmin kontaktieren**
Wenn nichts davon hilft, gib der Systemadministration folgende Infos:
- Welcher Drucker (Artikel- oder Behälteretikett)?
- Wann ist das Problem zuerst aufgetreten?
- Gibt es eine Fehlermeldung? (bitte Screenshot)

---

## 2. WebDAV ist nicht erreichbar

### Was ist WebDAV?
WebDAV ist ein gemeinsam genutzter Netzwerkspeicher für Artikelbilder und Dokumente. Wenn er nicht erreichbar ist, können Bilder nicht gespeichert oder angezeigt werden.

### Symptome
- Bilder können nicht hochgeladen werden.
- Bereits hochgeladene Bilder werden nicht angezeigt.
- Beim ERP-Sync erscheint eine Fehlermeldung zur Medienübertragung.

### Was du prüfen kannst

**Schritt 1 — Netzwerkverbindung**
Stell sicher, dass dein Gerät mit dem Firmennetzwerk verbunden ist. Probier kurz einen anderen internen Dienst, um zu sehen, ob das Netzwerk generell funktioniert.

**Schritt 2 — Kurz warten und nochmal versuchen**
Manchmal ist der WebDAV-Server kurz nicht erreichbar (z. B. nach einem Neustart). Wart 2–3 Minuten und versuch's dann nochmal.

**Schritt 3 — Sysadmin benachrichtigen**
Wenn das Problem länger als 5 Minuten anhält, meld es der Systemadministration:
- Seit wann ist das bekannt?
- Was hast du versucht zu tun (Bild hochladen, ERP-Sync, …)?
- Gibt es eine Fehlermeldung im System?

> **Hinweis:** Das System speichert Artikeldaten auch dann korrekt, wenn WebDAV nicht verfügbar ist. Nur Bilder und Mediendateien sind betroffen.

---

## 3. Bilder werden nicht angezeigt

### Symptome
- Im Bild-Tab erscheint ein leeres Feld oder ein defektes Bild-Symbol.
- Bilder wurden hochgeladen, aber nach dem Neuladen sind sie weg.

### Was du prüfen kannst

**Schritt 1 — Seite neu laden**
Drück `F5` oder `Strg + R` (Windows) bzw. `Cmd + R` (Mac).

**Schritt 2 — Anderen Browser oder Gerät testen**
Öffne den Artikel auf einem anderen Gerät oder Browser. Wenn die Bilder dort erscheinen, liegt's am ersten Browser (z. B. Cache-Problem).

**Schritt 3 — Browser-Cache leeren**
- Chrome: `Strg + Umschalt + Entf` → „Bilder und Dateien im Cache" → „Daten löschen"
- Firefox: `Strg + Umschalt + Entf` → „Cache" → „Jetzt löschen"

**Schritt 4 — WebDAV prüfen**
Bilder liegen auf dem WebDAV-Server. Wenn der nicht erreichbar ist, können keine Bilder geladen werden → siehe Abschnitt 2.

**Schritt 5 — Sysadmin benachrichtigen**
Wenn Bilder dauerhaft fehlen, könnte ein Konfigurationsproblem vorliegen. Meld es mit Artikelnummer und Zeitpunkt des letzten Uploads.

---

## 4. Veraltete Daten im Browser

### Symptome
- Du siehst eine alte Version eines Artikels oder eine leere Liste, obwohl Daten vorhanden sein müssten.
- Ein anderes Gerät zeigt andere Daten als deins.

### Was du tun kannst

**Schritt 1 — Hard Refresh**
`Strg + Umschalt + R` (Windows/Linux) oder `Cmd + Umschalt + R` (Mac) — erzwingt ein vollständiges Neuladen ohne Cache.

**Schritt 2 — Cache komplett leeren**
Wenn Hard Refresh nicht hilft, lösche den Browser-Cache vollständig (→ Abschnitt 3, Schritt 3).

**Schritt 3 — Inkognito-Tab testen**
Öffne die App in einem Inkognito-/Privatfenster. Wenn die Daten dort stimmen, liegt es am Cache oder an Extensions in deinem normalen Browser.

---

## 5. Seite lädt nicht / reagiert nicht

### Symptome
- Die App lädt ewig oder zeigt nur eine leere Seite.
- Schaltflächen reagieren nicht.

### Was du prüfen kannst

**Schritt 1 — Netzwerk**
Ist dein Gerät mit dem Internet/Firmennetzwerk verbunden?

**Schritt 2 — Anderen Browser testen**
Öffne die App in Chrome oder Firefox (je nachdem, was du normalerweise nicht nutzt).

**Schritt 3 — Browser-Konsole prüfen**
Drück `F12` → Tab „Konsole". Siehst du rote Fehlermeldungen? Mach einen Screenshot davon — das hilft der Sysadmin bei der Diagnose.

**Schritt 4 — Sysadmin benachrichtigen**
Wenn die App dauerhaft nicht reagiert, ist wahrscheinlich der Server nicht erreichbar. Meld es mit Screenshot der Fehlermeldung und ungefährem Zeitpunkt.

---

## 6. KI-Anreicherung hängt

### Symptome
- Im KI-Tab steht seit Minuten „Wird ausgeführt…" ohne Fortschritt.
- Der Status wechselt nicht zu „Überprüfung erforderlich".

### Was du tun kannst

**Schritt 1 — Kurz warten**
Die KI-Anreicherung kann je nach Artikel 1–3 Minuten dauern. Wart kurz ab, bevor du etwas unternimmst.

**Schritt 2 — Seite neu laden**
Lade die Seite neu (`F5`). Manchmal aktualisiert sich der Status nicht automatisch.

**Schritt 3 — Lauf neu starten**
Wenn der Lauf nach 5 Minuten noch läuft: Klick auf **Neu starten** (im KI-Tab, falls verfügbar) oder zuerst **Lauf löschen** und dann **KI-Anreicherung starten**.

**Schritt 4 — Sysadmin benachrichtigen**
Wenn Neustarts nichts bringen, könnte ein Problem mit dem KI-Dienst vorliegen. Nenn Artikelnummer und seit wann der Lauf hängt.

---

## 7. Ein Fehler ist passiert — was tun?

Keine Panik. Die meisten Aktionen lassen sich korrigieren.

### 7a. Falscher Lagerort

**Problem:** Ein Artikel oder Behälter wurde falsch umgelagert.

**Lösung:** Einfach nochmal umlagern.
1. Artikel öffnen → Tab **Vorrat** → **Umlagern**.
2. Richtigen Behälter wählen.
3. Bestätigen.

Für Behälter: Behälter öffnen → **Umlagern** → richtiges Regal wählen.

> Alle Bewegungen werden in der Aktivitätshistorie protokolliert — du kannst jederzeit nachvollziehen, wer was wann verschoben hat.

---

### 7b. Falsche Artikeldaten

**Problem:** Beim Erfassen wurden falsche Daten eingegeben.

**Lösung:** Artikel bearbeiten.
1. Artikel öffnen → Tab **Referenz** → **Bearbeiten**.
2. Fehlerhafte Felder korrigieren.
3. Speichern.

> **Achtung:** Artikelnummern sollte man nur ändern, wenn sie wirklich falsch sind und der Artikel noch nicht synchronisiert wurde. Im Zweifel erst mit der vorgesetzten Person absprechen.

---

### 7c. Falscher QR-Code aufgeklebt / Etikett fehlt

**Problem:** Ein Etikett wurde auf dem falschen Artikel befestigt, oder es ist verloren gegangen.

**Lösung:** Neues Etikett drucken.
1. Richtigen Artikel öffnen → Tab **Vorrat** → **Etikett drucken**.
2. Neues Etikett aufkleben — das alte bitte entfernen oder unkenntlich machen.

---

### 7d. Artikel versehentlich gelöscht

**Problem:** Ein Artikel wurde über **Löschen** entfernt.

**Lösung:** Das Löschen kann nicht selbst rückgängig gemacht werden.
- Sofort die Systemadministration kontaktieren.
- Artikelnummer bereithalten — das System protokolliert Löschvorgänge, und eine Wiederherstellung aus dem Backup ist möglich.

> **Tipp:** Nutze die Lösch-Funktion nur, wenn ein Artikel wirklich nicht existiert. Artikel, die einfach nicht mehr verkauft werden, einfach im Shop-Status auf „kein Shopartikel" setzen — dann bleiben sie im System.

---

### 7e. KI hat falsche Daten eingetragen

**Problem:** Nach der KI-Anreicherung sind falsche Spezifikationen oder ein falscher Preis im Artikel.

**Lösung:**
- **Vor der Freigabe:** Im Review-Schritt die falschen Felder ablehnen oder den Preis direkt korrigieren.
- **Nach der Freigabe:** Artikel öffnen → Tab **Referenz** → **Bearbeiten** und die Felder manuell korrigieren. Alternativ im Tab **KI** die Anreicherung neu starten.

---

### 7f. Falscher ERP-Export

**Problem:** Beim ERP-Sync wurden die falschen Artikel ausgewählt oder mit falschen Daten übertragen.

**Lösung:** Falls die Daten im System inzwischen korrigiert wurden, kannst du die Artikel erneut auswählen und nochmal per **ERP-Sync** übertragen — das überschreibt den vorherigen Export. Bei größeren Fehlern oder wenn Daten direkt im ERP geändert werden müssen, bitte die ERP-verantwortliche Person kontaktieren.

---

## Noch immer ein Problem?

Wenn du dein Problem hier nicht findest oder die Schritte nicht geholfen haben:

1. Mach einen **Screenshot** der Fehlermeldung oder des betroffenen Bildschirms.
2. Notiere die **Artikelnummer** oder **Behälter-ID** (falls vorhanden).
3. Notiere **Datum und Uhrzeit** des Vorfalls.
4. Wende dich mit diesen Infos an die **Systemadministration**.
