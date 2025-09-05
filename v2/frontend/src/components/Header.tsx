import React from 'react';
import { Link } from 'react-router-dom';

export default function Header() {
  return (
    <header className="header">
      <nav>
        <Link to="/">Home</Link>
      </nav>
      <h1>Mediator Service v2</h1>
    </header>
  );
}
