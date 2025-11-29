import React, { useCallback, useMemo, useState } from 'react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  query?: string;
}

const ChatPlaceholder: React.FC = () => {
  const introMessage = useMemo<ChatMessage>(
    () => ({
      role: 'assistant',
      content:
        'Frag nach Artikeln, Boxen oder Lagerplätzen. Ich schlage dir nur SQLite-SELECTs auf dem Item-Schema vor, die noch nicht ausgeführt werden.',
      query: 'SELECT ItemUUID, Artikelbeschreibung, BoxID FROM items WHERE Artikelbeschreibung LIKE "%monitor%" LIMIT 5;'
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
        const sqliteQuery = typeof payload?.result?.sqliteQuery === 'string' ? payload.result.sqliteQuery.trim() : '';

        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: reply,
            query: sqliteQuery || undefined
          }
        ]);
      } catch (err) {
        console.error('[chat-ui] Failed to send chat message', err);
        setSendError('Fehler beim Senden der Nachricht.');
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: 'Es gab ein Problem beim Senden oder Empfangen der Nachricht.',
            query: undefined
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
              {message.query ? (
                <div className="muted">
                  <div>SQLite-Vorschlag:</div>
                  <code>{message.query}</code>
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
