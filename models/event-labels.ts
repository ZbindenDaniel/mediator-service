// TODO: Consolidate these event label definitions with the JavaScript variant.
export const EVENT_LABELS: Record<string, string> = {
  ManualCreateOrUpdate: 'Manuell erstellt/aktualisiert',
  Edit: 'Bearbeitet',
  Added: 'Hinzugefügt',
  updated: 'Aktualisiert',
  Moved: 'Verschoben',
  PrintSent: 'Etikett gedruckt',
  PrintPreviewSaved: 'Etikettenvorschau gespeichert',
  TestPrinted: 'Testdruck gesendet',
  TestPreviewSaved: 'Testvorschau gespeichert',
  Note: 'Notiz',
  Removed: 'Entfernt',
  Deleted: 'Gelöscht',
  Exported: 'Exportiert',
  Created: 'Erstellt',
  AgenticRunRestarted: 'Ki-Lauf neu gestartet',
  AgenticRunCancelled: 'Ki-Lauf abgebrochen',
  AgenticTriggerFailed: 'Ki-Auslösung fehlgeschlagen',
  AgenticSearchQueued: 'Ki-Suche eingereiht',
  AgenticResultReceived: 'Agentic-Ergebnis erhalten',
  AgenticResultFailed: 'Ki-Ergebnis fehlgeschlagen',
  AgenticReviewApproved: 'Ki-Prüfung freigegeben',
  AgenticReviewRejected: 'Ki-Prüfung abgelehnt',
  QrScanned: 'QR-Code gescannt'
};

export function eventLabel(eventKey: string): string {
  return EVENT_LABELS[eventKey] || eventKey;
}

export default { EVENT_LABELS, eventLabel };
