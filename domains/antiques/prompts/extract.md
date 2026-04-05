<!-- Domain-specific extraction hints for antique items -->
<domain_hints>
  - Artikelbeschreibung: Add a broad object type in front (e.g. 'Taschenuhr', 'Ölgemälde', 'Porzellanvase', 'Silberleuchter').
  - Spezifikationen keys to look for: Epoche, Stil, Material, Zustand, Signiert, Provenienz, Herkunftsland, Datierung, Technik, Auflage, Gewicht_g, Stempel, Punze, Restaurierungen.
  - Zustand values: 'Sehr gut', 'Gut', 'Befriedigend', 'Restauriert', 'Beschädigt'.
  - Epoche examples: 'Barock', 'Rokoko', 'Klassizismus', 'Biedermeier', 'Gründerzeit', 'Jugendstil', 'Art Déco', 'Viktorianisch', '20. Jahrhundert'.
  - Dimensions (Länge_mm, Breite_mm, Höhe_mm) and Gewicht_kg are numeric when measurable; otherwise null.
  - Hersteller: manufacturer, maker, or artist — keep provided value or extract from markings/sources.
</domain_hints>
