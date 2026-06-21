import React, { useEffect, useRef } from 'react';
import { DialogOverlay } from './dialog/presentational';

export interface BindingOption {
  type: string;
  label: string;
  value: string;
  identifierType: string;
  endpoint: { kind: 'instance' } | { kind: 'external'; dirName: string };
}

interface Props {
  file: File;
  options: BindingOption[];
  onConfirm: (binding: BindingOption) => void;
  onCancel: () => void;
}

function identifierTypeLabel(type: string): string {
  switch (type) {
    case 'artikelNummer': return 'Artikel-Nr.';
    case 'serialNumber': return 'SN';
    case 'macAddress': return 'MAC';
    case 'ean': return 'EAN';
    default: return type;
  }
}

export default function AttachmentBindingModal({ file, options, onConfirm, onCancel }: Props) {
  const [selected, setSelected] = React.useState<string>(options[0]?.type ?? '');
  const contentRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(o => o.type === selected) ?? options[0];

  useEffect(() => {
    const node = contentRef.current;
    if (!node) return;
    node.querySelector<HTMLElement>('input[type="radio"]')?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    }
    node.addEventListener('keydown', onKeyDown);
    return () => node.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <DialogOverlay onDismiss={onCancel}>
      <div
        className="dialog-content"
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
      >
        <h2 className="dialog-title">Datei zuordnen</h2>
        <div className="dialog-message">
          Wähle, woran <strong>{file.name}</strong> gebunden werden soll.
        </div>
        <div className="dialog-body">
          <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
            <legend className="muted" style={{ fontSize: '0.85em', marginBottom: '8px' }}>
              Zuordnung
            </legend>
            {options.map(opt => (
              <label
                key={opt.type}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  marginBottom: '12px',
                  cursor: 'pointer'
                }}
              >
                <input
                  type="radio"
                  name="attachment-binding"
                  value={opt.type}
                  checked={selected === opt.type}
                  onChange={() => setSelected(opt.type)}
                  style={{ marginTop: '3px' }}
                />
                <span>
                  <span>{opt.label}</span>
                  {opt.identifierType !== 'instance' && (
                    <span className="muted" style={{ display: 'block', fontSize: '0.82em', marginTop: '1px' }}>
                      {identifierTypeLabel(opt.identifierType)}: {opt.value}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </fieldset>
          <div className="dialog-buttons">
            <button
              type="button"
              className="btn"
              onClick={() => selectedOption && onConfirm(selectedOption)}
            >
              Anhängen
            </button>
            <button type="button" className="btn" onClick={onCancel}>
              Abbrechen
            </button>
          </div>
        </div>
      </div>
    </DialogOverlay>
  );
}
