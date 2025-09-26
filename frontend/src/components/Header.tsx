import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getUser } from '../lib/user';

export default function Header() {
  const [user, setUser] = useState('');

  useEffect(() => {
    try {
      setUser(getUser());
    } catch (err) {
      console.error('Failed to load user', err);
    }
  }, []);

  return (
    <header className="header">
      <div className="left">
        <nav>
            <button id='header-back-button' type="button" onClick={() => window.history.back()}>{String.fromCharCode(8592)}</button>
            <Link to="/scan" className="nav-link">QR-Scanner</Link>
        </nav>
        <h1><a id="homelink" href="/">rrrevamp_____</a></h1>
      </div>
      <div className="user">{user}</div>
    </header>
  );
}
