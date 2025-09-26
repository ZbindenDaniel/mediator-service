export interface BoxColorOption {
  value: string;
  label: string;
  hex: string;
}

export const BOX_COLORS: BoxColorOption[] = [
  { value: 'red', label: 'Rot', hex: '#d32f2f' },
  { value: 'blue', label: 'Blau', hex: '#1976d2' },
  { value: 'green', label: 'Grün', hex: '#388e3c' },
  { value: 'yellow', label: 'Gelb', hex: '#fbc02d' },
  { value: 'orange', label: 'Orange', hex: '#f57c00' },
  { value: 'purple', label: 'Violett', hex: '#7b1fa2' },
  { value: 'pink', label: 'Pink', hex: '#d81b60' },
  { value: 'brown', label: 'Braun', hex: '#6d4c41' },
  { value: 'gray', label: 'Grau', hex: '#546e7a' }
];
