# CO₂-Einsparung: Wie wird gerechnet?

Gebrauchte IT-Geräte zu kaufen statt neue zu produzieren spart erheblich CO₂. Diese Seite erklärt, wie das System den Einsparungswert für jeden Artikel schätzt.

---

## Warum spart Secondhand-IT CO₂?

Über 70–80 % des CO₂-Fußabdrucks eines Geräts (Laptop, PC, Server usw.) entsteht bei der **Herstellung** — nicht im Betrieb. Wenn ein funktionsfähiges Gerät weiterverwendet wird, muss kein neues produziert werden. Damit entfällt der größte Teil des Lebenszyklus-CO₂.

---

## Formel (ADEME 2022)

```
CO₂_gespart = E_neu × R_wiederverw × L_Faktor − O_aufarbeit
```

| Variable | Bedeutung |
|---|---|
| **E_neu** | CO₂-Ausstoß bei Herstellung eines neuen Geräts gleicher Kategorie (kg CO₂e) |
| **R_wiederverw** | Faktor für die Nutzungseffizienz bei Wiederverwendung (0,85 nach ADEME) |
| **L_Faktor** | Anteil der typischen Nutzungsdauer, die noch verbleibt (0–1) |
| **O_aufarbeit** | CO₂ für Aufarbeitung / Reinigung / Test je nach Zustand (5–20 kg) |

### L_Faktor im Detail

```
verbleibende_Jahre = max(0, Gesamtlebensdauer − Gerätealter)
L_Faktor           = min(1, verbleibende_Jahre / typische_Neulebensdauer)
```

Das Gerätealter ergibt sich aus dem Erfassungsdatum. Fehlt dieses, wird ein Standardwert von 4 Jahren angesetzt.

### Aufarbeitungsaufwand nach Qualität

| Qualitätsstufe | Intensität | CO₂ (kg) |
|---|---|---|
| 5 oder 4 | Gering (Reinigung, Test) | 5 |
| 3 | Mittel (Teileaustausch) | 10 |
| 2 oder 1 | Hoch (Reparatur, Datenlöschung) | 20 |

---

## Rechenbeispiel

**Laptop, 3 Jahre alt, Qualität 3:**

- E_neu = 180 kg CO₂e (ADEME-Median für Laptops)
- R = 0,85
- Gesamtlebensdauer = 8 Jahre, typische Nutzungsdauer neu = 5 Jahre
- Verbleibend = 8 − 3 = 5 Jahre → L = 5/5 = 1,0
- O_aufarbeit = 10 kg (Qualität 3 → mittel)

**CO₂_gespart = 180 × 0,85 × 1,0 − 10 = 143 kg CO₂e**

Das entspricht etwa **430 km Autofahrt** (Pkw mit ~33 g CO₂/km Strecke).

---

## Unterstützte Gerätekategorien

Die Berechnung ist für folgende Kategorien hinterlegt:

Laptops, Netbooks, Tablets, Komplettsysteme, Standard-PCs, Barebones/Mini-PCs, MACs, Workstations, Thin-Clients, Server, Drucker, Multifunktionsgeräte, Flachbildschirme, Grafikkarten, Netzwerkkarten, Switches/Hubs, Router/DSL.

Für Kabel, Verbrauchsmaterialien, Kleinzubehör und nicht zugeordnete Artikel wird kein Wert angezeigt.

---

## Wichtiger Hinweis

Die Werte sind **Schätzungen** auf Basis von Gerätekategorie-Medianen (ADEME 2022, Herstellerdaten). Die tatsächliche Einsparung kann ±20–50 % abweichen, je nach Modell, Betriebsland und Nutzungsweise. Die Zahlen dienen zur **internen Orientierung** und sind kein zertifizierter CO₂-Nachweis.
