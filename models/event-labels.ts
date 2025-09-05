export const EVENT_LABELS: Record<string, string> = {
  ManualCreateOrUpdate: 'Manuell erstellt/aktualisiert',
  Edit: 'Bearbeitet',
  Moved: 'Verschoben',
  PrintSent: 'Etikett gedruckt',
  PrintPreviewSaved: 'Etikettenvorschau gespeichert',
  TestPrinted: 'Testdruck gesendet',
  TestPreviewSaved: 'Testvorschau gespeichert',
  Note: 'Notiz',
  // Add more as needed
};

export function eventLabel(eventKey: string): string {
  return EVENT_LABELS[eventKey] || eventKey;
}

export default { EVENT_LABELS, eventLabel };
