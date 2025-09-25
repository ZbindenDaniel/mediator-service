const EVENT_LABELS = {
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
  Created: 'Erstellt'
};

function eventLabel(eventKey) {
  return EVENT_LABELS[eventKey] || eventKey;
}

module.exports = {
  EVENT_LABELS,
  eventLabel,
  default: { EVENT_LABELS, eventLabel }
};
