import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import QualityReviewStep from '../QualityReviewStep';
import type { QualityReviewResult } from '../QualityReviewStep';
import PartRemovalForm from './PartRemovalForm';
import SparepartSlotPopup from '../SparepartSlotPopup';
import { dialogService } from '../dialog';
import { clearQualityDraft } from '../../lib/qualityDraft';
import type { PartsTreeNode, NodeRef } from '../../lib/partsTree';
import {
  createComponent,
  detachPart,
  findNode,
  findSlot,
  isPresenceQuestion,
  pathTo,
  saveOwnAssessment,
  saveSlotAnswers,
  scoreChildrenOf,
  slotOf,
} from '../../lib/partsTree';
import { SLOT_INTEGRATED, SLOT_PRESENT } from '../../../../models/assembly-contract';
import { formatQualityScoreRange } from '../../../../models/quality-score';

// Right panel of the Einzelteile page: the selected node's own condition (Zustand) — only its own
// questions; presence lives in the tree. Saving sends only those answers, the server keeps the
// slot answers (quality-review carry-over), so this panel can never undo a chip clicked on the left.

interface Props {
  tree: PartsTreeNode;
  selected: NodeRef;
  canEdit: boolean;
  /** Reloads the tree and resolves with the fresh one. */
  refresh: () => Promise<PartsTreeNode | null>;
  onSelect: (ref: NodeRef) => void;
}

// Survives the remount after a save (the page remounts this panel per tree revision).
let lastSavedKey: string | null = null;

export default function PartNodePanel({ tree, selected, canEdit, refresh, onSelect }: Props) {
  const node = 'itemUUID' in selected ? findNode(tree, selected.itemUUID) : null;
  const slot = 'itemUUID' in selected ? null : findSlot(tree, selected.parentUUID, selected.slotKey);
  const parentNode = 'itemUUID' in selected ? null : findNode(tree, selected.parentUUID);
  const subCategory = node ? node.subCategory : slot ? slot.part.targetSubcategory : null;
  const draftKey = 'itemUUID' in selected ? selected.itemUUID : `${selected.parentUUID}>${selected.slotKey}`;
  const isRoot = node?.itemUUID === tree.itemUUID;
  const home = node && !isRoot ? slotOf(tree, node.itemUUID) : null;
  // Built-in parts are assessed like any part but can never leave the device.
  const integrated = (home?.slot ?? slot)?.answer === SLOT_INTEGRATED;

  const [initialAnswers, setInitialAnswers] = useState<Record<string, string> | null>(node ? null : {});
  const [justSaved] = useState(() => lastSavedKey === draftKey);
  useEffect(() => { if (justSaved) lastSavedKey = null; }, [justSaved]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRelocate, setShowRelocate] = useState(false);
  const [showRefPicker, setShowRefPicker] = useState(false);

  useEffect(() => {
    if (!node) return;
    let cancelled = false;
    fetch(`/api/items/${encodeURIComponent(node.itemUUID)}/quality-review`)
      .then((res) => (res.ok ? res.json() : { responses: {} }))
      .then((data: { responses?: Record<string, string> }) => { if (!cancelled) setInitialAnswers(data.responses ?? {}); })
      .catch(() => { if (!cancelled) setInitialAnswers({}); });
    return () => { cancelled = true; };
    // Only on (re)mount: the page remounts this panel per node and tree revision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!node && !slot) return <div className="panel-tab-body"><p className="muted">Dieses Teil gibt es nicht mehr.</p></div>;

  const label = node?.label ?? slot!.part.label;
  const crumbs = pathTo(tree, selected);
  const range = node && node.scoreMin !== null && node.scoreMax !== null ? formatQualityScoreRange({ min: node.scoreMin, max: node.scoreMax }) : null;
  const inDevice = !!node && !isRoot && !node.boxId;

  const handleComplete = async (result: QualityReviewResult) => {
    setSaving(true);
    setError(null);
    try {
      // Slot answers are the tree's: never send them from here, or a stale form copy would win.
      const slotIds = new Set((node?.assembly?.slots ?? []).flatMap((s) => [s.part.question?.id, s.part.specQuestion?.id]).filter(Boolean));
      const answers = Object.fromEntries(Object.entries(result.contractAnswers).filter(([id]) => !slotIds.has(id)));
      let itemUUID: string;
      if (node) {
        itemUUID = node.itemUUID;
      } else {
        const { parentUUID, slotKey } = selected as { parentUUID: string; slotKey: string };
        itemUUID = await createComponent(parentUUID, slotKey);
        // Assessing a part means it is there; an unconfirmed default ("n. v.") gives way too.
        const q = slot!.part.question;
        if (q && isPresenceQuestion(slot!.part) && (slot!.answer === null || slot!.answer === '')) {
          await saveSlotAnswers(parentUUID, { [q.id]: q.type === 'boolean' ? 'true' : SLOT_PRESENT });
        }
      }
      await saveOwnAssessment(itemUUID, answers, result.assessment.notes ?? null);
      clearQualityDraft(draftKey);
      // Stay on the saved node; a just-created part is now addressed by its own id.
      lastSavedKey = itemUUID;
      await refresh();
      if (!node) onSelect({ itemUUID });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDetach = async () => {
    if (!node) return;
    const ok = await dialogService.confirm({
      title: 'Teil lösen',
      message: `„${label}“ (${node.itemUUID}) wird gelöscht und der Steckplatz wieder frei. Seine Bewertung geht verloren.`,
      confirmLabel: 'Lösen',
      cancelLabel: 'Abbrechen',
    });
    if (!ok) return;
    try {
      await detachPart(node.itemUUID);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="panel-tab-body part-node">
      <nav className="part-node__crumbs" aria-label="Pfad">{crumbs.join(' › ')}</nav>
      <div className="part-node__head">
        <h2>{isRoot ? `${label} — Zustand des Geräts` : label}</h2>
        <p className="muted">
          {node ? node.itemUUID : 'noch nicht erfasst — wird beim Speichern angelegt'}
          {node?.artikelNummer && !isRoot ? ` · Artikel ${node.artikelNummer}` : ''}
          {range ? ` · ${range}` : ''}
          {node?.boxId ? ` · entnommen in ${node.boxId}` : ''}
        </p>
        {justSaved && <p className="part-node__saved" role="status">✓ Gespeichert</p>}
      </div>

      {error && <p className="ptree__error" role="alert">{error}</p>}

      {!canEdit ? (
        <p className="muted">Nur lesbar: dieses Gerät gehört einer anderen Organisation.</p>
      ) : initialAnswers === null ? (
        <p className="muted">Bewertung wird geladen…</p>
      ) : (
        <QualityReviewStep
          subCategory={subCategory ?? undefined}
          parts={node ? scoreChildrenOf(node) : undefined}
          draftKey={draftKey}
          initialAnswers={initialAnswers}
          questionScope="none"
          heading={null}
          submitLabel={saving ? 'Speichert…' : 'Speichern'}
          layout="embedded"
          disabled={saving}
          onComplete={(r) => void handleComplete(r)}
        />
      )}

      {/* After the answers loaded: the removal form takes the part's FRU from them once. */}
      {canEdit && !isRoot && initialAnswers !== null && (
        <div className="part-node__actions">
          {inDevice && !integrated && <button type="button" className="btn" onClick={() => setShowRelocate((v) => !v)}>Entnehmen…</button>}
          {inDevice && <button type="button" className="btn btn--secondary" onClick={() => void handleDetach()}>Lösen</button>}
          {inDevice && integrated && <span className="muted">fest verbaut — kann nicht entnommen werden</span>}
          {!node && slot && parentNode && (
            <button type="button" className="btn btn--secondary" onClick={() => setShowRefPicker(true)}>Mit Artikel erfassen…</button>
          )}
          {node && <Link className="btn btn--secondary" to={`/items/${encodeURIComponent(node.itemUUID)}`}>Artikel-Details</Link>}
        </div>
      )}
      {showRelocate && node && home && (
        <PartRemovalForm
          itemUUID={node.itemUUID}
          artikelNummer={node.artikelNummer}
          partLabel={home.slot.part.label}
          deviceLabel={tree.label}
          targetSubcategory={home.slot.part.targetSubcategory}
          fru={initialAnswers?.part_fru ?? null}
          onDone={async () => { setShowRelocate(false); await refresh(); }}
          onCancel={() => setShowRelocate(false)}
        />
      )}
      {showRefPicker && slot && parentNode && (
        <SparepartSlotPopup
          deviceItemUUID={parentNode.itemUUID}
          deviceLabel={tree.label}
          slotKey={slot.part.key}
          slotLabel={slot.part.label}
          targetSubcategory={slot.part.targetSubcategory}
          onComplete={async (newItemUUID) => { setShowRefPicker(false); await refresh(); onSelect({ itemUUID: newItemUUID }); }}
          onClose={() => setShowRefPicker(false)}
        />
      )}
    </div>
  );
}
