import React, { useState } from 'react';

interface Props {
  onSuccess: (token: string) => void;
}

export default function AdminGate({ onSuccess }: Props) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setChecking(true);
    try {
      const res = await fetch('/api/admin/config', {
        headers: { 'Authorization': `Bearer ${input}` },
      });
      if (res.ok) {
        sessionStorage.setItem('adminSecret', input);
        onSuccess(input);
      } else {
        setError('Falsches Passwort.');
      }
    } catch {
      setError('Netzwerkfehler.');
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="admin-gate">
      <h2>Administrationszugang</h2>
      <form onSubmit={(e) => void handleSubmit(e)} className="admin-gate__form">
        <input
          type="password"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Passwort"
          autoFocus
          disabled={checking}
        />
        <button type="submit" disabled={checking || !input}>
          {checking ? 'Prüfe…' : 'Anmelden'}
        </button>
      </form>
      {error && <p className="admin-gate__error">{error}</p>}
    </div>
  );
}
