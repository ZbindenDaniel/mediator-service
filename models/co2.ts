export type Co2ImpactLabel = 'high' | 'medium' | 'low' | 'irrelevant';

export const CO2_IMPACT_LABEL_DE: Record<Co2ImpactLabel, string> = {
  high:       'Hohes Potenzial',
  medium:     'Mittleres Potenzial',
  low:        'Geringes Potenzial',
  irrelevant: 'Kein Potenzial',
};

export interface Co2ImpactResult {
  label:  Co2ImpactLabel;
  score:  number;
  eNewKg: number;
  source: 'category-lookup';
}
