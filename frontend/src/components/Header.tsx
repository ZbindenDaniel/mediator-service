import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getUser, setUser as persistUser } from '../lib/user';
import { GoArrowLeft } from 'react-icons/go';

export default function Header() {
  const [user, setUserState] = useState('');

  useEffect(() => {
    try {
      setUserState(getUser());
    } catch (err) {
      console.error('Failed to load user', err);
    }
  }, []);

  const handleUserDoubleClick = useCallback(() => {
    try {
      const next = window.prompt('Bitte geben Sie einen neuen Benutzernamen ein:', user) ?? '';
      const trimmed = next.trim();
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
    } catch (err) {
      console.error('Failed to update username', err);
    }
  }, [user]);

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
