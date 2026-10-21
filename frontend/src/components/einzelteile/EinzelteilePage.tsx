import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import PartsTreeView from './PartsTreeView';
import PartNodePanel from './PartNodePanel';
import type { PartsTreeNode, NodeRef } from '../../lib/partsTree';
import { fetchPartsTree, nodeRefKey, parseNodeRef } from '../../lib/partsTree';

// Einzelteile: take a device apart part by part, on the whole page. Left the tree (device → work
// steps → parts), right the condition of the selected node. Both sides belong to one device and read
// one tree snapshot; the selected node lives in the URL (?node=) so a reload keeps the place.

export default function EinzelteilePage() {
  const { itemId = '' } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selected = parseNodeRef(searchParams.get('node'), itemId);
  const [tree, setTree] = useState<PartsTreeNode | null>(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(true);
  // Narrow screens show one side at a time: the tree, or the selected node.
  const [showDetail, setShowDetail] = useState(false);

  const close = useCallback(() => navigate(`/items?entity=item&id=${encodeURIComponent(itemId)}&tab=instance`), [navigate, itemId]);

  const refresh = useCallback(async (): Promise<PartsTreeNode | null> => {
    try {
      const fresh = await fetchPartsTree(itemId);
      setTree(fresh);
      setRevision((r) => r + 1);
      setError(null);
      return fresh;
    } catch (err) {
      setError((err as Error).message);
      return null;
    }
  }, [itemId]);

  useEffect(() => {
    void refresh();
    fetch(`/api/items/${encodeURIComponent(itemId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { permissions?: { canEditItem?: boolean } } | null) => setCanEdit(data?.permissions?.canEditItem !== false))
      .catch(() => { /* keep editable; the server guards every write anyway */ });
  }, [itemId, refresh]);

  useEffect(() => {
    // Esc leaves the page — but not while typing in a field or inside a dialog.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [role="dialog"]')) return;
      close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const select = useCallback((ref: NodeRef) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('node', nodeRefKey(ref));
      return next;
    }, { replace: true });
    setShowDetail(true);
  }, [setSearchParams]);

  return (
    <div className="einzelteile">
      <header className="einzelteile__bar">
        <div className="einzelteile__title">
          <span className="einzelteile__kicker">Einzelteile</span>
          <h1>{tree?.label ?? '…'}</h1>
          {tree && <span className="muted">{tree.itemUUID}{tree.artikelNummer ? ` · Artikel ${tree.artikelNummer}` : ''}</span>}
        </div>
        <button type="button" className="btn einzelteile__close" onClick={close} title="Schliessen (Esc)">
          ✕ Schliessen
        </button>
      </header>

      {error && !tree && <p className="ptree__error">Einzelteile konnten nicht geladen werden: {error}</p>}
      {!tree && !error && <p className="muted einzelteile__loading">Einzelteile werden geladen…</p>}

      {tree && (
        <div className={`einzelteile__body${showDetail ? ' einzelteile__body--detail' : ''}`}>
          <section className="einzelteile__tree" aria-label="Aufbau">
            <PartsTreeView tree={tree} selected={selected} canEdit={canEdit} onSelect={select} onChanged={() => void refresh()} />
          </section>
          <section className="einzelteile__detail" aria-label="Zustand">
            <button type="button" className="link-btn einzelteile__back" onClick={() => setShowDetail(false)}>← Aufbau</button>
            {/* Remount per node and tree revision: the form reloads its answers, unsaved input survives via the draft. */}
            <PartNodePanel
              key={`${nodeRefKey(selected)}:${revision}`}
              tree={tree}
              selected={selected}
              canEdit={canEdit}
              refresh={refresh}
              onSelect={select}
            />
          </section>
        </div>
      )}
    </div>
  );
}
