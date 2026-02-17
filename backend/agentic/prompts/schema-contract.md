# Agentic Spezifikationen Schema Contract

All extraction, categorization, and supervision exchanges should follow this item shape:

```json
{
  "Artikel_Nummer": "",
  "Artikelbeschreibung": "",
  "Verkaufspreis": null,
  "Kurzbeschreibung": "",
  "Spezifikationen": {
    "Veröffentlicht": "",
    "Stromversorgung": ""
  },
  "Hersteller": "",
  "Länge_mm": null,
  "Breite_mm": null,
  "Höhe_mm": null,
  "Gewicht_kg": null,
  "Hauptkategorien_A": null,
  "Unterkategorien_A": null,
  "Hauptkategorien_B": null,
  "Unterkategorien_B": null,
  "reviewNotes": ""
}
```

Rules:
- `Spezifikationen` is the canonical nested specs field; do not use `Langtext` in LLM-facing payloads.
- `Spezifikationen` values are `string | string[]`.
- Numeric fields are `number | null`.
- Category fields are nullable numbers and optional when a stage only edits a subset.
