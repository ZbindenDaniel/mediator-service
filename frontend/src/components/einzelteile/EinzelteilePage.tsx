import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import PartsTreeView from './PartsTreeView';
import PartNodePanel from './PartNodePanel';
import type { PartsTreeNode, NodeRef } from '../../lib/partsTree';
import { fetchPartsTree, nextOpenNode, nodeRefKey, parseNodeRef } from '../../lib/partsTree';

// Einzelteile: take a device apart part by part. Left = Aufbau (what is there, per work step),
// right = Zustand of the selected node. A full-screen route with its own two columns (the shell's
// classes, so mobile list ↔ detail works the same) because both sides belong to one device and
// must share one tree snapshot; the selected node lives in the URL (?node=) so a reload keeps it.

export default function EinzelteilePage() {
  const { itemId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const selected = parseNodeRef(searchParams.get('node'), itemId);
  const [tree, setTree] = useState<PartsTreeNode | null>(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(true);
  const [showDetail, setShowDetail] = useState(() => window.matchMedia('(min-width: 901px)').matches);

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

  const select = useCallback((ref: NodeRef) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('node', nodeRefKey(ref));
      return next;
    }, { replace: true });
    setShowDetail(true);
  }, [setSearchParams]);

  const onSaved = useCallback((saved: NodeRef, fresh: PartsTreeNode | null) => {
    const next = fresh ? nextOpenNode(fresh, saved) : null;
    select(next ?? saved);
  }, [select]);

  if (error && !tree) return <div className="panel-tab-body"><p className="parts-tree__error">Einzelteile konnten nicht geladen werden: {error}</p></div>;
  if (!tree) return <div className="panel-tab-body"><p className="muted">Einzelteile werden geladen…</p></div>;

  return (
    <div className={`app-shell einzelteile ${showDetail ? 'app-shell--mobile-detail' : 'app-shell--mobile-list'}`}>
      <div className="panel-main einzelteile__main">
        <div className="einzelteile__head">
          <Link to={`/items?entity=item&id=${encodeURIComponent(itemId)}`} className="link-btn">← zum Artikel</Link>
          <h1>Einzelteile · {tree.label}</h1>
          <p className="muted">{tree.itemUUID}{tree.artikelNummer ? ` · Artikel ${tree.artikelNummer}` : ''}</p>
        </div>
        <PartsTreeView tree={tree} selected={selected} canEdit={canEdit} onSelect={select} onChanged={() => void refresh()} />
      </div>
      <div className="app-shell__right">
        <div className="panel-detail-header einzelteile__mobile-back">
          <button type="button" className="panel-detail-header__back" onClick={() => setShowDetail(false)}>
            <span className="panel-detail-header__arrow" aria-hidden="true">←</span>
            <span>Aufbau</span>
          </button>
        </div>
        {/* Remount per node and tree revision: the form reloads its answers, unsaved input survives via the draft. */}
        <PartNodePanel
          key={`${nodeRefKey(selected)}:${revision}`}
          tree={tree}
          selected={selected}
          canEdit={canEdit}
          refresh={refresh}
          onSaved={onSaved}
          onSelect={select}
        />
      </div>
    </div>
  );
}
