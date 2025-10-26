// TODO: Consolidate these event label definitions with the JavaScript variant.
export const EVENT_LABELS: Record<string, string> = {
  Created: 'erstellt',
  ManualCreateOrUpdate: 'erstellt/aktualisiert',
  Added: 'hinzugefügt',
  Updated: 'aktualisiert',
  Moved: 'verschoben',
  Removed: 'entnommen',
  Deleted: 'gelöscht',
  Exported: 'exportiert',
  Note: 'Notiz',
  QrScanned: 'QR gescannt',
  PrintSent: 'Etikett gedruckt',
  PrintPreviewSaved: 'Etikett gespeichert',
  TestPrinted: 'Testdruck gesendet',
  TestPreviewSaved: 'Testvorschau gespeichert',
  AgenticRunRestarted: 'Ki-Suche neu gestartet',
  AgenticRunCancelled: 'Ki-Suche abgebrochen',
  AgenticTriggerFailed: 'Ki-Suche fehlgeschlagen',
  AgenticSearchQueued: 'Ki-Suche eingereiht',
  AgenticResultReceived: 'Ki-Ergebnis erhalten',
  AgenticResultFailed: 'Ki-Lauf fehlgeschlagen',
  AgenticReviewApproved: 'Ki-Ergebnis freigegeben',
  AgenticReviewRejected: 'Ki-Ergebnis abgelehnt'
};

export function eventLabel(eventKey: string): string {
  return EVENT_LABELS[eventKey] || eventKey;
}

export default { EVENT_LABELS, eventLabel };
