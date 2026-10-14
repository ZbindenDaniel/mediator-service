import React, { useEffect, useRef, useState } from 'react';
import { DialogButtons, DialogContent, DialogOverlay } from './dialog/presentational';
import { useIdentity } from '../context/IdentityContext';
import type { Role } from '../context/IdentityContext';
import { applyTheme, getThemePreference, setThemePreference } from '../lib/theme';
import type { ThemePreference } from '../lib/theme';

const ROLE_LABELS: Record<Role, string> = {
  'platform-admin': 'Plattform-Administration',
  super: 'Organisations-Administration',
  normal: 'Benutzer'
};

// Authentik's embedded outpost ends the session and redirects to the login.
const LOGOUT_URL = '/outpost.goauthentik.io/sign_out';

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'Wie Gerät' },
  { value: 'light', label: 'Hell' },
  { value: 'dark', label: 'Dunkel' }
];

interface Props {
  currentUser: string;
  currentSimpleMode: boolean;
  onSave: (username: string, simpleMode: boolean) => void;
  onCancel: () => void;
}

export default function UserSettingsDialog({ currentUser, currentSimpleMode, onSave, onCancel }: Props) {
  const identity = useIdentity();
  const [username, setUsername] = useState(currentUser);
  const [simpleMode, setSimpleModeState] = useState(currentSimpleMode);
  const [initialTheme] = useState(getThemePreference);
  const [theme, setTheme] = useState<ThemePreference>(initialTheme);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // The theme previews live while choosing; cancel restores what was stored.
  const handleCancel = () => {
    applyTheme(initialTheme);
    onCancel();
  };

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleCancel();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });

  const handleThemeChange = (next: ThemePreference) => {
    setTheme(next);
    applyTheme(next);
  };

  const handleConfirm = () => {
    setThemePreference(theme);
    onSave(username.trim(), simpleMode);
  };

  return (
    <DialogOverlay onDismiss={handleCancel}>
      <DialogContent
        heading="Benutzereinstellungen"
        message={identity.authenticated ? 'Angemeldet über das Benutzerkonto.' : 'Benutzername und Anzeigemodus anpassen.'}
        role="dialog"
      >
        {identity.authenticated ? (
          // The login decides who you are; a free-text name would undermine the audit trail.
          <dl className="user-settings__identity">
            <dt>Benutzer</dt>
            <dd>{identity.username}</dd>
            <dt>Organisation</dt>
            <dd>{identity.tenantLabel ?? identity.tenant ?? '—'}</dd>
            <dt>Rolle</dt>
            <dd>{identity.role ? ROLE_LABELS[identity.role] : '—'}</dd>
            <dd className="user-settings__logout"><a href={LOGOUT_URL}>Abmelden</a></dd>
          </dl>
        ) : (
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
        )}
        <label className="dialog-field dialog-field--checkbox">
          <input
            type="checkbox"
            checked={simpleMode}
            onChange={(event) => setSimpleModeState(event.target.checked)}
          />
          <span>Einfacher Modus (weniger anzeigen)</span>
        </label>
        <label className="dialog-field">
          <span>Farbschema</span>
          <select value={theme} onChange={(event) => handleThemeChange(event.target.value as ThemePreference)}>
            {THEME_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <DialogButtons
          type="prompt"
          confirmLabel="Speichern"
          cancelLabel="Abbrechen"
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      </DialogContent>
    </DialogOverlay>
  );
}
