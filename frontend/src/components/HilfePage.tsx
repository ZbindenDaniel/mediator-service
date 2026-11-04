import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getUser, setUser } from '../lib/user';
import { logError } from '../utils/logger';

interface DocEntry {
  name: string;
  title: string;
}

function tableCells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

function renderMarkdown(md: string): React.ReactNode[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;

  const listItem = (line: string) => line.match(/^(\d+\.|[-*+])\s+(.*)$/);
  const isTable = (index: number) => (
    lines[index]?.trim().startsWith('|') &&
    tableCells(lines[index + 1] ?? '').length === tableCells(lines[index]).length &&
    tableCells(lines[index + 1] ?? '').every((cell) => /^:?-{3,}:?$/.test(cell))
  );
  const startsBlock = (index: number) => (
    /^(#{1,3} |---\s*$|```|>)/.test(lines[index]) || listItem(lines[index]) || isTable(index)
  );

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('### ')) {
      nodes.push(<h3 key={i}>{inlineMarkdown(line.slice(4))}</h3>);
    } else if (line.startsWith('## ')) {
      nodes.push(<h2 key={i}>{inlineMarkdown(line.slice(3))}</h2>);
    } else if (line.startsWith('# ')) {
      nodes.push(<h1 key={i}>{inlineMarkdown(line.slice(2))}</h1>);
    } else if (isTable(i)) {
      const headers = tableCells(line);
      const rows: string[][] = [];
      const tableKey = i;
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(tableCells(lines[i]));
        i++;
      }
      nodes.push(
        <div key={tableKey} className="hilfe-table-scroll" tabIndex={0} role="region" aria-label="Hilfetabelle">
          <table className="hilfe-table">
            <thead>
              <tr>{headers.map((header, index) => <th key={index} scope="col">{inlineMarkdown(header)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {headers.map((_, columnIndex) => <td key={columnIndex}>{inlineMarkdown(row[columnIndex] ?? '')}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      i--;
    } else if (line.trim() === '---') {
      nodes.push(<hr key={i} />);
    } else if (listItem(line)) {
      const first = listItem(line)!;
      const ordered = /^\d/.test(first[1]);
      const items: React.ReactNode[] = [];
      const listKey = i;

      while (i < lines.length) {
        const match = listItem(lines[i]);
        if (!match || /^\d/.test(match[1]) !== ordered) break;
        const itemKey = i;
        const indent = lines[i].length - match[2].length;
        const itemLines = [match[2]];
        i++;

        // Keep indented content inside its step so nested lists and code retain their context.
        while (i < lines.length) {
          if (lines[i].startsWith(' '.repeat(indent))) {
            itemLines.push(lines[i].slice(indent));
            i++;
          } else if (!lines[i].trim() && lines[i + 1]?.startsWith(' '.repeat(indent))) {
            itemLines.push('');
            i++;
          } else {
            break;
          }
        }

        const task = itemLines[0].match(/^\[([ xX])\]\s+(.*)$/);
        if (task) {
          const done = task[1].toLowerCase() === 'x';
          items.push(
            <li key={itemKey} className="hilfe-check-item">
              <label className={`hilfe-check-row${done ? ' hilfe-check-row--done' : ''}`}>
                <input type="checkbox" defaultChecked={done} />
                <span>{inlineMarkdown(task[2])}</span>
              </label>
              {renderMarkdown(itemLines.slice(1).join('\n'))}
            </li>
          );
        } else {
          items.push(<li key={itemKey}>{renderMarkdown(itemLines.join('\n'))}</li>);
        }
        while (i < lines.length && !lines[i].trim()) i++;
      }

      nodes.push(ordered
        ? <ol key={listKey} start={Number.parseInt(first[1], 10)}>{items}</ol>
        : <ul key={listKey}>{items}</ul>);
      i--;
    } else if (line.startsWith('>')) {
      const quoteKey = i;
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        quoteLines.push(lines[i].replace(/^> ?/, ''));
        i++;
      }
      nodes.push(<blockquote key={quoteKey}>{renderMarkdown(quoteLines.join('\n'))}</blockquote>);
      i--;
    } else if (line.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      nodes.push(<pre key={i} className="hilfe-code"><code>{codeLines.join('\n')}</code></pre>);
    } else if (line.trim() === '') {
      i++;
      continue;
    } else {
      const paragraphKey = i;
      const paragraph = [line.trim()];
      i++;
      while (i < lines.length && lines[i].trim() && !startsBlock(i)) {
        paragraph.push(lines[i].trim());
        i++;
      }
      nodes.push(<p key={paragraphKey}>{inlineMarkdown(paragraph.join(' '))}</p>);
      i--;
    }
    i++;
  }

  return nodes;
}

function inlineMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={idx}>{inlineMarkdown(part.slice(2, -2))}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={idx}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={idx}>{inlineMarkdown(part.slice(1, -1))}</em>;
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return <a key={idx} href={linkMatch[2]} target='_blank' rel='noopener noreferrer'>{inlineMarkdown(linkMatch[1])}</a>;
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
