module.exports = {
  name: "validate",
  apply(row) {
    const errors = [];
    const warnings = [];

    console.log(`Validating item ${row?.ItemUUID ?? "unknown"}`);

    try {
      const fields = {
        ItemUUID: "string",
        BoxID: "string",
        Location: "string",
        UpdatedAt: "string",
        Datum_erfasst: "string",
        Artikel_Nummer: "string",
        Grafikname: "string",
        Artikelbeschreibung: "string",
        Auf_Lager: "integer",
        Verkaufspreis: "number",
        Hersteller: "string",
        Länge_mm: "integer",
        Breite_mm: "integer",
        Höhe_mm: "integer",
        Gewicht_kg: "number",
        Hauptkategorien_A: "string",
        Unterkategorien_A: "string",
        Hauptkategorien_B: "string",
        Unterkategorien_B: "string",
        Veröffentlicht_Status: "string",
        Shopartikel: "integer",
        Artikeltyp: "string",
        Einheit: "string",
        WmsLink: "string"
      };

      for (const [field, type] of Object.entries(fields)) {
        const value = row[field];
        if (value === undefined || value === null || value === "") {
          (field === "ItemUUID" || field === "BoxID")
            ? errors.push(`${field} missing`)
            : warnings.push(`${field} missing`);
          continue;
        }

        if (type === "string" && typeof value !== "string") {
          errors.push(`${field} must be a string`);
        } else if (type === "integer" && !Number.isInteger(Number(value))) {
          errors.push(`${field} must be an integer`);
        } else if (type === "number" && Number.isNaN(Number(value))) {
          errors.push(`${field} must be a number`);
        }
      }
    } catch (err) {
      console.error("Validation exception", err);
      errors.push("Unexpected validation error");
    }

    return { ok: errors.length === 0, row, warnings, errors };
  }
};
