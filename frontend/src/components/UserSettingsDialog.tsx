import React, { useEffect, useRef, useState } from 'react';
import { DialogButtons, DialogContent, DialogOverlay } from './dialog/presentational';

interface Props {
  currentUser: string;
  currentSimpleMode: boolean;
  onSave: (username: string, simpleMode: boolean) => void;
  onCancel: () => void;
}

export default function UserSettingsDialog({ currentUser, currentSimpleMode, onSave, onCancel }: Props) {
  const [username, setUsername] = useState(currentUser);
  const [simpleMode, setSimpleModeState] = useState(currentSimpleMode);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  const handleConfirm = () => onSave(username.trim(), simpleMode);

  return (
    <DialogOverlay onDismiss={onCancel}>
      <DialogContent
        heading="Benutzereinstellungen"
        message="Benutzername und Anzeigemodus anpassen."
        role="dialog"
      >
        <label className="dialog-field">
          <span>Benutzername</span>
          <input
            ref={inputRef}
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') handleConfirm(); }}
          />
        </label>
        <label className="dialog-field dialog-field--checkbox">
          <input
            type="checkbox"
            checked={simpleMode}
            onChange={(event) => setSimpleModeState(event.target.checked)}
          />
          <span>Einfacher Modus (weniger anzeigen)</span>
        </label>
        <DialogButtons
          type="prompt"
          confirmLabel="Speichern"
          cancelLabel="Abbrechen"
          onConfirm={handleConfirm}
          onCancel={onCancel}
        />
      </DialogContent>
    </DialogOverlay>
  );
}
