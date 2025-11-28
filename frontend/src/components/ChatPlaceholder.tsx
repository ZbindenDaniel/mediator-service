import React, { useCallback, useMemo, useState } from 'react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  queries?: string[];
}

const ChatPlaceholder: React.FC = () => {
  const introMessage = useMemo<ChatMessage>(
    () => ({
      role: 'assistant',
      content:
        'Frag nach Artikeln, Boxen oder Lagerplätzen. Ich schlage dir nur SQLite-SELECTs auf dem Item-Schema vor, ' +
        'die noch nicht ausgeführt werden.',
      queries: [
        'SELECT ItemUUID, Artikelbeschreibung, BoxID FROM items WHERE Artikelbeschreibung LIKE "%monitor%" LIMIT 5;'
      ]
    }),
    []
  );
  const [messages, setMessages] = useState<ChatMessage[]>([introMessage]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // TODO(chat-ui-persistence): Persist chat drafts and responses locally once storage hooks are available.
  const handleSend = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = input.trim();
      if (!trimmed || isSending) {
        return;
      }

      const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: trimmed }];
      setMessages(nextMessages);
      setInput('');
      setIsSending(true);
      setSendError(null);

      try {
        console.info('[chat-ui] Sending chat message', { messageLength: trimmed.length });
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: nextMessages })
        });

        if (!response.ok) {
          const fallback = await response.text();
          console.warn('[chat-ui] Chat response not ok', { status: response.status, fallback });
          setSendError('Der Chat-Agent konnte nicht antworten.');
          return;
        }

        const payload = await response.json();
        const reply = (payload?.result?.reply as string) || 'Keine Antwort vom Chat-Agenten erhalten.';
        const sqliteQueries = Array.isArray(payload?.result?.sqliteQueries)
          ? (payload.result.sqliteQueries as string[]).filter((entry) => typeof entry === 'string' && entry.trim().length)
          : [];

        setMessages((prev) => [...prev, { role: 'assistant', content: reply, queries: sqliteQueries }]);
      } catch (err) {
        console.error('[chat-ui] Failed to send chat message', err);
        setSendError('Fehler beim Senden der Nachricht.');
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: 'Es gab ein Problem beim Senden oder Empfangen der Nachricht.',
            queries: []
          }
        ]);
      } finally {
        setIsSending(false);
      }
    },
    [input, isSending, messages]
  );

  return (
    <div className="container">
      <h1>Chat</h1>
      <div className="card">
        <h3>Chat (MVP)</h3>
        <p className="muted">
          Der Chat-Agent läuft im Dry-Run-Modus und liefert ausschließlich vorgeschlagene SQLite-Queries für das Item-Schema.
        </p>

        <div className="chat-thread" aria-live="polite">
          {messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className="chat-message">
              <div className="muted">{message.role === 'user' ? 'Du' : 'Agent'}</div>
              <p>{message.content}</p>
              {message.queries && message.queries.length > 0 ? (
                <div className="muted">
                  <div>SQLite-Vorschläge:</div>
                  <ul>
                    {message.queries.map((query, queryIndex) => (
                      <li key={`query-${index}-${queryIndex}`}>
                        <code>{query}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <form onSubmit={handleSend} className="chat-input">
          <label className="muted" htmlFor="chat-input-textarea">
            Nachricht an den Agenten
          </label>
          <textarea
            id="chat-input-textarea"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={3}
            placeholder="Beschreibe dein Anliegen..."
            disabled={isSending}
          />
          {sendError ? <p className="muted" role="alert">{sendError}</p> : null}
          <button type="submit" disabled={isSending || !input.trim()}>
            {isSending ? 'Sende…' : 'Senden'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatPlaceholder;
