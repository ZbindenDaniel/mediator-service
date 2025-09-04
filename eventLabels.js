const EVENT_LABELS = {
    ManualCreateOrUpdate: "Manuell erstellt/aktualisiert",
    Edit: "Bearbeitet",
    Moved: "Verschoben",
    PrintSent: "Etikett gedruckt",
    PrintPreviewSaved: "Etikettenvorschau gespeichert",
    TestPrinted: "Testdruck gesendet",
    TestPreviewSaved: "Testvorschau gespeichert",
    Note: "Notiz",
    // Add more as needed
};

function eventLabel(eventKey) {
    return EVENT_LABELS[eventKey] || eventKey;
}

module.exports = { EVENT_LABELS, eventLabel };