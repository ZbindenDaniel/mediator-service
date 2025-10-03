export const EVENT_LABELS: Record<string, string> = {
  ManualCreateOrUpdate: 'Manuell erstellt/aktualisiert',
  Edit: 'Bearbeitet',
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
  AgenticRunRestarted: 'Agentic-Lauf neu gestartet',
  AgenticRunCancelled: 'Agentic-Lauf abgebrochen',
  AgenticTriggerFailed: 'Agentic-Auslösung fehlgeschlagen',
  AgenticSearchQueued: 'Agentic-Suche eingereiht',
  AgenticResultReceived: 'Agentic-Ergebnis erhalten',
  AgenticResultFailed: 'Agentic-Ergebnis fehlgeschlagen',
  AgenticReviewApproved: 'Agentic-Prüfung freigegeben',
  AgenticReviewRejected: 'Agentic-Prüfung abgelehnt',
  QrScanned: 'QR-Code gescannt'
};

export function eventLabel(eventKey: string): string {
  return EVENT_LABELS[eventKey] || eventKey;
}

export default { EVENT_LABELS, eventLabel };
