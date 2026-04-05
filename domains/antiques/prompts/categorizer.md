<examples>

Input:

```
    "item": {
      "Artikelbeschreibung": "Taschenuhr Longines, Silber 925, Schweizer Werk, ca. 1890",
      "Verkaufspreis": 0,
      "Kurzbeschreibung": "Elegante Taschenuhr der Marke Longines aus der Gründerzeit um 1890. Gehäuse aus Sterling-Silber (925), rundes Zifferblatt mit römischen Ziffern, Schweizer Lever-Echappement-Werk in tadellosem Laufzustand. Signiertes Zifferblatt. Durchmesser 52 mm.",
      "Spezifikationen": {
        "Hersteller": "Longines",
        "Epoche": "Gründerzeit / Viktorianisch",
        "Material": "Silber 925",
        "Durchmesser_mm": "52",
        "Werk": "Schweizer Lever-Echappement",
        "Zifferblatt": "Weißes Email, römische Ziffern",
        "Signiert": "Longines",
        "Zustand": "Gut, läuft"
      },
      "Hersteller": "Longines",
      "Länge_mm": null,
      "Breite_mm": null,
      "Höhe_mm": null,
      "Gewicht_kg": 0.12,
      "Hauptkategorien_A": null,
      "Unterkategorien_A": null,
      "Hauptkategorien_B": null,
      "Unterkategorien_B": null
    }
}

```

Output:

```
{
  "Hauptkategorien_A": 30,
  "Unterkategorien_A": 301,
  "Hauptkategorien_B": null,
  "Unterkategorien_B": null
}
```

</examples>
