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
          <Link to="/">Home</Link>
        </nav>
        <h1>rrrevamp</h1>
      </div>
      <div className="user">{user}</div>
    </header>
  );
}
