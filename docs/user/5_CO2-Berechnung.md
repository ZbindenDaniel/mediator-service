# CO₂-Einsparung: Wie wird gerechnet?
<!-- feature: statistics -->

Diese Seite erklärt, wie das System schätzt, wie viel CO₂ ein gebrauchtes Gerät gegenüber einem Neugerät einspart.

---

## Grundlage

Bei IT-Geräten (Laptop, PC, Server usw.) entstehen etwa 70–80 % der CO₂-Emissionen bei der **Herstellung**, nicht im Betrieb. Wird ein Gerät weiterverwendet, muss kein neues hergestellt werden. Diese Herstellungsemissionen werden eingespart.

---

## Formel (ADEME 2022)

```
CO₂_gespart = E_neu × R_wiederverw × L_Faktor − O_aufarbeit
```

| Variable | Bedeutung |
|---|---|
| **E_neu** | CO₂-Ausstoss bei Herstellung eines neuen Geräts gleicher Kategorie (kg CO₂e) |
| **R_wiederverw** | Anteil, der bei Wiederverwendung tatsächlich angerechnet wird (0,85 nach ADEME) |
| **L_Faktor** | Anteil der typischen Nutzungsdauer, der noch übrig ist (0–1) |
| **O_aufarbeit** | CO₂ für Aufarbeitung, Reinigung und Test, je nach Zustand (5–20 kg) |

### L_Faktor im Detail

```
verbleibende_Jahre = max(0, Gesamtlebensdauer − Gerätealter)
L_Faktor           = min(1, verbleibende_Jahre / typische_Neulebensdauer)
```

Das Gerätealter wird aus dem Erfassungsdatum berechnet. Fehlt es, rechnet das System mit 4 Jahren.

### Aufarbeitungsaufwand nach Qualität

| Qualitätsstufe | Intensität | CO₂ (kg) |
|---|---|---|
| 5 oder 4 | Gering (Reinigung, Test) | 5 |
| 3 | Mittel (Teileaustausch) | 10 |
| 2 oder 1 | Hoch (Reparatur, Datenlöschung) | 20 |

---

## Rechenbeispiel

**Laptop, 3 Jahre alt, Qualität 3:**

- E_neu = 180 kg CO₂e ([ADEME 2022](https://data.europa.eu/data/datasets/5db1a0f46f444104866d1b43?locale=en)-Median für Laptops)
- R = 0,85
- Gesamtlebensdauer = 8 Jahre, typische Nutzungsdauer neu = 5 Jahre
- Verbleibend = 8 − 3 = 5 Jahre → L = 5/5 = 1,0
- O_aufarbeit = 10 kg (Qualität 3 → mittel)

**CO₂_gespart = 180 × 0,85 × 1,0 − 10 = 143 kg CO₂e**

Das entspricht etwa **1000 km Autofahrt** (Benzin-Pkw mit rund 140 g CO₂/km).

---

## Unterstützte Gerätekategorien

Die Berechnung ist für diese Kategorien hinterlegt:

Laptops, Netbooks, Tablets, Komplettsysteme, Standard-PCs, Barebones/Mini-PCs, MACs, Workstations, Thin-Clients, Server, Drucker, Multifunktionsgeräte, Flachbildschirme, Grafikkarten, Netzwerkkarten, Switches/Hubs, Router/DSL.

Für Kabel, Verbrauchsmaterialien, Kleinzubehör und nicht zugeordnete Artikel wird kein Wert angezeigt.

---

## Was das System aktuell anzeigt

Pro Artikel zeigt das System keinen kg-Wert, sondern eine Einstufung: **Irrelevant**, **Niedrig**, **Mittel** oder **Hoch**. Sie wird mit einer vereinfachten Formel berechnet:

```
Punkte = E_neu × (Qualität / 5)
```

`Qualität` ist die Qualitätsstufe 1–5. Bessere Qualität ergibt eine höhere Einstufung. Lebensdauer und Aufarbeitungsaufwand aus der ADEME-Formel fliessen in die Einstufung nicht ein.

---

## Genauigkeit

Die Werte sind **Schätzungen** auf Basis von Medianwerten pro Gerätekategorie ([ADEME 2022](https://data.europa.eu/data/datasets/5db1a0f46f444104866d1b43?locale=en), Herstellerdaten). Die tatsächliche Einsparung kann je nach Modell, Land und Nutzung um 20–50 % abweichen. Die Zahlen sind für die **interne Orientierung** gedacht und kein zertifizierter CO₂-Nachweis.
