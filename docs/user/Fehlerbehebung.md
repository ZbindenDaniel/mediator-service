# Fehlerbehebung

Diese Seite hilft Ihnen bei häufigen Problemen. Führen Sie die Schritte der Reihe nach aus und prüfen Sie nach jedem Schritt, ob das Problem behoben ist.

---

## 1. Drucker funktioniert nicht

### Symptome
- Die Meldung „Kein Drucker konfiguriert" erscheint nach dem Drucken.
- Das Etikett wird nicht gedruckt, obwohl kein Fehler angezeigt wird.
- Die Vorschau erscheint, aber der Druckauftrag kommt nicht an.

### Was Sie prüfen können

**Schritt 1 — Ist der Drucker eingeschaltet?**
Prüfen Sie, ob der Etikettendrucker eingeschaltet ist und keine Fehleranzeige (z. B. rotes Lämpchen oder Papierstau) hat.

**Schritt 2 — Papier und Etikettenrolle**
Öffnen Sie das Druckerfach und prüfen Sie, ob Etiketten eingelegt sind und die Rolle korrekt sitzt.

**Schritt 3 — Netzwerkverbindung des Druckers**
Vergewissern Sie sich, dass der Drucker mit dem Netzwerk verbunden ist (Kabel oder WLAN-Anzeige leuchtet). Versuchen Sie, den Drucker neu zu starten.

**Schritt 4 — Druckervorschau nutzen**
Wenn der Drucker nicht erreichbar ist, erzeugt das System automatisch eine Vorschau-Datei. Laden Sie diese herunter und drucken Sie sie manuell über Ihren Computer.

**Schritt 5 — Systemadministration benachrichtigen**
Wenn keiner der obigen Schritte hilft, wenden Sie sich an Ihre Systemadministration und teilen Sie folgende Informationen mit:
- Welcher Drucker (Artikel- oder Behälteretikett)?
- Wann ist das Problem zuerst aufgetreten?
- Wird eine Fehlermeldung angezeigt? (bitte Screenshot)

---

## 2. WebDAV ist nicht erreichbar

### Was ist WebDAV?
WebDAV ist ein gemeinsam genutzter Netzwerkspeicher, auf dem Artikelbilder und Dokumente abgelegt werden. Wenn WebDAV nicht erreichbar ist, können Bilder nicht gespeichert oder angezeigt werden.

### Symptome
- Bilder können nicht hochgeladen werden.
- Bereits hochgeladene Bilder werden nicht angezeigt.
- Beim ERP-Sync erscheint eine Fehlermeldung zur Medienübertragung.

### Was Sie prüfen können

**Schritt 1 — Netzwerkverbindung prüfen**
Vergewissern Sie sich, dass Ihr Computer oder das Gerät mit dem Firmennetzwerk verbunden ist. Öffnen Sie kurz einen anderen Netzwerkdienst (z. B. ein internes Verzeichnis), um zu prüfen, ob das Netzwerk generell funktioniert.

**Schritt 2 — Kurz warten und erneut versuchen**
Gelegentlich ist der WebDAV-Server vorübergehend nicht erreichbar (z. B. nach einem Neustart). Warten Sie 2–3 Minuten und versuchen Sie den Vorgang erneut.

**Schritt 3 — Systemadministration benachrichtigen**
Wenn das Problem länger als 5 Minuten anhält, ist es wahrscheinlich ein serverseitiges Problem. Melden Sie das Problem Ihrer Systemadministration mit folgenden Angaben:
- Seit wann ist das Problem bekannt?
- Was haben Sie versucht zu tun (Bild hochladen, ERP-Sync, …)?
- Gibt es eine Fehlermeldung im System?

> **Hinweis:** Das System speichert Artikeldaten auch dann korrekt, wenn WebDAV nicht verfügbar ist. Lediglich Bilder und Mediendateien sind betroffen.

---

## 3. Bilder werden nicht angezeigt

### Symptome
- Im Bild-Tab eines Artikels erscheint ein leeres Feld oder ein defektes Bild-Symbol.
- Bilder wurden hochgeladen, aber nach dem Neuladen der Seite sind sie verschwunden.

### Was Sie prüfen können

**Schritt 1 — Seite neu laden**
Drücken Sie `F5` oder `Strg + R` (Windows) bzw. `Cmd + R` (Mac), um die Seite neu zu laden.

**Schritt 2 — Anderen Browser oder Gerät testen**
Öffnen Sie den Artikel auf einem anderen Gerät oder Browser. Wenn die Bilder dort erscheinen, liegt das Problem beim ersten Browser (z. B. Cache-Problem).

**Schritt 3 — Browser-Cache leeren**
- Chrome: `Strg + Umschalt + Entf` → „Bilder und Dateien im Cache" → „Daten löschen"
- Firefox: `Strg + Umschalt + Entf` → „Cache" → „Jetzt löschen"

**Schritt 4 — Prüfen, ob WebDAV erreichbar ist**
Bilder liegen auf dem WebDAV-Server. Wenn WebDAV nicht erreichbar ist, können Bilder nicht geladen werden. Lesen Sie dazu Abschnitt 2 dieser Seite.

**Schritt 5 — Systemadministration benachrichtigen**
Wenn Bilder nach dem Hochladen dauerhaft fehlen, könnte ein Konfigurationsproblem mit dem Medienspeicher vorliegen. Melden Sie es mit Artikelnummer und dem Zeitpunkt des letzten Uploads.

---

## 4. Ein Fehler ist passiert — was tun?

Keine Panik. Die meisten Aktionen im System lassen sich korrigieren.

### 4a. Falscher Lagerort (falsch umgelagert)

**Problem:** Ein Artikel oder Behälter wurde in den falschen Behälter oder auf das falsche Regal umgelagert.

**Lösung:** Einfach erneut umlagern.
1. Öffnen Sie den betroffenen Artikel → Tab **Vorrat** → **Umlagern**.
2. Wählen Sie den richtigen Behälter.
3. Bestätigen Sie.

Für Behälter: Öffnen Sie den Behälter → **Umlagern** → richtiges Regal auswählen.

> Alle Bewegungen werden in der Aktivitätshistorie protokolliert — Sie können jederzeit nachvollziehen, wer was wann verschoben hat.

---

### 4b. Falsche Artikeldaten (Artikelnummer, Beschreibung, Maße)

**Problem:** Beim Erfassen wurden falsche Daten eingegeben.

**Lösung:** Artikel bearbeiten.
1. Öffnen Sie den Artikel → Tab **Referenz** → **Bearbeiten**.
2. Korrigieren Sie die fehlerhaften Felder.
3. Speichern Sie.

> **Achtung:** Artikelnummern sollten nur geändert werden, wenn sie wirklich falsch sind und der Artikel noch nicht synchronisiert wurde. Wenden Sie sich im Zweifel an Ihre Vorgesetzte oder Ihren Vorgesetzten.

---

### 4c. Falscher QR-Code aufgeklebt oder Etikett fehlt

**Problem:** Ein Etikett wurde auf dem falschen Artikel befestigt, oder das Etikett ist verloren gegangen.

**Lösung:** Neues Etikett drucken.
1. Öffnen Sie den richtigen Artikel → Tab **Vorrat** → **Etikett drucken**.
2. Kleben Sie das neue Etikett auf den Artikel. Das alte Etikett bitte entfernen oder unkenntlich machen.

---

### 4d. Artikel versehentlich gelöscht

**Problem:** Ein Artikel wurde über **Löschen** entfernt.

**Lösung:** Das Löschen kann nicht selbst rückgängig gemacht werden.
- Wenden Sie sich sofort an Ihre Systemadministration.
- Halten Sie die Artikelnummer bereit — das System protokolliert Löschvorgänge, und eine Wiederherstellung aus dem Backup ist möglich.

> **Tipp:** Nutzen Sie die Lösch-Funktion nur dann, wenn ein Artikel wirklich nicht existiert. Artikel, die einfach nicht mehr verkauft werden, können im Shop-Status auf „kein Shopartikel" gesetzt werden, ohne sie zu löschen.

---

### 4e. KI hat falsche Daten eingetragen

**Problem:** Nach der KI-Anreicherung sind falsche Spezifikationen oder ein falscher Preis im Artikel.

**Lösung:** Review-Schritt nutzen oder Daten manuell korrigieren.

- **Vor der Freigabe:** Lehnen Sie im Review-Schritt die falschen Felder ab oder korrigieren Sie den Preis direkt im Eingabefeld.
- **Nach der Freigabe:** Öffnen Sie den Artikel → Tab **Referenz** → **Bearbeiten** und korrigieren Sie die betroffenen Felder manuell. Alternativ können Sie im Tab **KI** die Anreicherung neu starten.

---

### 4f. Falscher ERP-Export (falsche Artikel übertragen)

**Problem:** Beim ERP-Sync wurden die falschen Artikel ausgewählt oder mit falschen Daten übertragen.

**Lösung:** Wenden Sie sich an Ihre Systemadministration oder die ERP-verantwortliche Person. Das System protokolliert jeden Sync-Vorgang. Eine Korrektur muss direkt im ERP-System oder durch einen erneuten Sync mit korrigierten Daten erfolgen.

---

## Noch immer ein Problem?

Wenn Sie Ihr Problem hier nicht finden oder die Schritte nicht geholfen haben:

1. Machen Sie einen **Screenshot** der Fehlermeldung oder des betroffenen Bildschirms.
2. Notieren Sie die **Artikelnummer** oder **Behälter-ID** (falls vorhanden).
3. Notieren Sie **Datum und Uhrzeit** des Vorfalls.
4. Wenden Sie sich mit diesen Informationen an Ihre **Systemadministration**.
