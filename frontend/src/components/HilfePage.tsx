import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getUser, setUser } from '../lib/user';
import { logError } from '../utils/logger';

interface DocEntry {
  name: string;
  title: string;
}

function renderMarkdown(md: string): React.ReactNode[] {
  const lines = md.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('### ')) {
      nodes.push(<h3 key={i}>{inlineMarkdown(line.slice(4))}</h3>);
    } else if (line.startsWith('## ')) {
      nodes.push(<h2 key={i}>{inlineMarkdown(line.slice(3))}</h2>);
    } else if (line.startsWith('# ')) {
      nodes.push(<h1 key={i}>{inlineMarkdown(line.slice(2))}</h1>);
    } else if (line.trim() === '---') {
      nodes.push(<hr key={i} />);
    } else if (line.startsWith('- [ ] ')) {
      nodes.push(
        <label key={i} className="hilfe-check-row">
          <input type="checkbox" />
          <span>{inlineMarkdown(line.slice(6))}</span>
        </label>
      );
    } else if (line.startsWith('- [x] ') || line.startsWith('- [X] ')) {
      nodes.push(
        <label key={i} className="hilfe-check-row hilfe-check-row--done">
          <input type="checkbox" defaultChecked />
          <span>{inlineMarkdown(line.slice(6))}</span>
        </label>
      );
    } else if (line.startsWith('- ')) {
      nodes.push(<li key={i}>{inlineMarkdown(line.slice(2))}</li>);
    } else if (line.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      nodes.push(<pre key={i} className="hilfe-code"><code>{codeLines.join('\n')}</code></pre>);
    } else if (line.trim() === '') {
      nodes.push(<br key={i} />);
    } else {
      nodes.push(<p key={i}>{inlineMarkdown(line)}</p>);
    }
    i++;
  }

  return nodes;
}

function inlineMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={idx}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={idx}>{part.slice(1, -1)}</code>;
    }
    return part.replace(/&nbsp;/g, ' ');
  });
}

function UsernameSetup({ onSaved }: { onSaved: (name: string) => void }) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSave = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setUser(trimmed);
    onSaved(trimmed);
  };

  return (
    <div className="hilfe-username-setup">
      <p><strong>Willkommen!</strong> Bitte geben Sie Ihren Namen ein, damit Ihre Aktionen im System zugeordnet werden können.</p>
      <div className="hilfe-username-setup__row">
        <input
          ref={inputRef}
          type="text"
          placeholder="Ihr Name"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
          className="hilfe-username-setup__input"
          aria-label="Benutzername"
        />
        <button type="button" className="btn btn--primary" onClick={handleSave} disabled={!value.trim()}>
          Speichern
        </button>
      </div>
    </div>
  );
}

export default function HilfePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState(() => getUser().trim());

  const docParam = searchParams.get('doc');
  const activeDoc = docParam ?? null;

  const setActiveDoc = (name: string) => {
    setSearchParams({ doc: name }, { replace: false });
  };

  useEffect(() => {
    fetch('/api/user-docs')
      .then((r) => r.json() as Promise<DocEntry[]>)
      .then((list) => {
        setDocs(list);
        // if no doc param yet, default to first doc
        if (!docParam && list.length > 0 && list[0]) {
          setSearchParams({ doc: list[0].name }, { replace: true });
        }
      })
      .catch((err) => logError('HilfePage: failed to load doc list', err));
  // run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeDoc) return;
    setLoading(true);
    setContent(null);
    fetch(`/api/user-docs/${encodeURIComponent(activeDoc)}`)
      .then((r) => r.text())
      .then((text) => { setContent(text); setLoading(false); })
      .catch((err) => {
        logError('HilfePage: failed to load doc', err);
        setLoading(false);
      });
  }, [activeDoc]);

  const activeIndex = docs.findIndex((d) => d.name === activeDoc);
  const prevDoc = activeIndex > 0 ? docs[activeIndex - 1] : null;
  const nextDoc = activeIndex >= 0 && activeIndex < docs.length - 1 ? docs[activeIndex + 1] : null;

  const showUsernameSetup = !username;

  return (
    <div className="list-container hilfe">
      <div className="page-header">
        <h1>Hilfe</h1>
      </div>
      {showUsernameSetup && (
        <UsernameSetup onSaved={(name) => setUsername(name)} />
      )}
      <div className="hilfe-layout">
        <nav className="hilfe-sidebar" aria-label="Dokumente">
          {docs.map((doc) => (
            <button
              key={doc.name}
              type="button"
              className={`hilfe-sidebar__item${activeDoc === doc.name ? ' hilfe-sidebar__item--active' : ''}`}
              onClick={() => setActiveDoc(doc.name)}
            >
              {doc.title}
            </button>
          ))}
        </nav>
        <article className="hilfe-content card">
          {loading && <p>Wird geladen…</p>}
          {!loading && content !== null && (
            <>
              {renderMarkdown(content)}
              {(prevDoc || nextDoc) && (
                <nav className="hilfe-doc-nav" aria-label="Dokument-Navigation">
                  <div className="hilfe-doc-nav__prev">
                    {prevDoc && (
                      <button type="button" className="btn" onClick={() => setActiveDoc(prevDoc.name)}>
                        ← {prevDoc.title}
                      </button>
                    )}
                  </div>
                  <div className="hilfe-doc-nav__next">
                    {nextDoc && (
                      <button type="button" className="btn" onClick={() => setActiveDoc(nextDoc.name)}>
                        {nextDoc.title} →
                      </button>
                    )}
                  </div>
                </nav>
              )}
            </>
          )}
          {!loading && content === null && docs.length === 0 && (
            <p>Keine Dokumente gefunden.</p>
          )}
        </article>
      </div>
    </div>
  );
}
