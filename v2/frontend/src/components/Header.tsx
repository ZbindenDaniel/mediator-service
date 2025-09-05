import React from 'react';
import { Link } from 'react-router-dom';

export default function Header() {
  return (
    <header className="header">
      <h1>Mediator Service v2</h1>
      <nav>
        <Link to="/">Home</Link>
        <Link to="/import">Import</Link>
      </nav>
    </header>
  );
}
