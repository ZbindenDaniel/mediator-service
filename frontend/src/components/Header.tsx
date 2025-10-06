import React, { useCallback, useEffect, useState } from 'react';
import { ensureUser, getUser, setUser as persistUser } from '../lib/user';
import { useDialog } from './dialog';
import { GoArrowLeft } from 'react-icons/go';

export default function Header() {
  const dialog = useDialog();
  const [user, setUserState] = useState(() => getUser().trim());

  useEffect(() => {
    let cancelled = false;
    const loadUser = async () => {
      try {
        const ensured = await ensureUser();
        if (!cancelled) {
          setUserState(ensured);
          if (!ensured) {
            console.info('No username persisted after ensureUser resolution.');
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to ensure user during header mount', err);
        }
      }
    };

    void loadUser();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleUserDoubleClick = useCallback(async () => {
    try {
      const result = await dialog.prompt({
        title: 'Benutzername bearbeiten',
        message: 'Bitte geben Sie einen neuen Benutzernamen ein:',
        defaultValue: user,
        confirmLabel: 'Speichern',
        cancelLabel: 'Abbrechen'
      });
      const trimmed = (result ?? '').trim();
      if (!trimmed) {
        console.info('Username update cancelled or empty input.');
        return;
      }
      if (trimmed === user) {
        console.info('Username remains unchanged.');
        return;
      }
      persistUser(trimmed);
      setUserState(trimmed);
      console.log('Username updated via header dialog.');
    } catch (err) {
      console.error('Failed to update username through dialog', err);
    }
  }, [dialog, user]);

  return (
    <header className="header">
      <div className="left">
        <nav>
            <button id='header-back-button' type="button" onClick={() => window.history.back()}><GoArrowLeft /></button>
        </nav>
        <h1><a id="homelink" href="/">rrrevamp_____</a></h1>
      </div>
      <div
        className="user"
        onDoubleClick={handleUserDoubleClick}
        title="Doppelklicken zum Bearbeiten des Benutzernamens"
        aria-label="Benutzername, doppelklicken zum Bearbeiten"
      >
        {user}
      </div>
    </header>
  );
}
