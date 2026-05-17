import React, { useEffect, useState } from 'react';
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
      // collect until closing ```
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
  // handle **bold** and `code`
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={idx}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={idx}>{part.slice(1, -1)}</code>;
    }
    // render &nbsp; as non-breaking space
    return part.replace(/&nbsp;/g, ' ');
  });
}

export default function HilfePage() {
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [activeDoc, setActiveDoc] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/user-docs')
      .then((r) => r.json() as Promise<DocEntry[]>)
      .then((list) => {
        setDocs(list);
        if (list.length > 0 && list[0]) setActiveDoc(list[0].name);
      })
      .catch((err) => logError('HilfePage: failed to load doc list', err));
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

  return (
    <div className="list-container hilfe">
      <div className="page-header">
        <h1>Hilfe</h1>
      </div>
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
          {!loading && content !== null && renderMarkdown(content)}
          {!loading && content === null && docs.length === 0 && (
            <p>Keine Dokumente gefunden.</p>
          )}
        </article>
      </div>
    </div>
  );
}
