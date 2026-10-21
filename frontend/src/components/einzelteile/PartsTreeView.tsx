import React, { useState } from 'react';
import type { PartsTreeNode, PartsTreeSlot, NodeRef, SlotState } from '../../lib/partsTree';
import { effectiveAnswer, groupSlotsBySteps, isPresenceQuestion, isSlotDone, nodeRefKey, saveSlotAnswers, slotState } from '../../lib/partsTree';
import { formatQualityScoreRange } from '../../../../models/quality-score';
import type { QualityQuestion } from '../../../../models/quality-contract';

// Left panel of the Einzelteile page: what the device is made of and what is there (Aufbau).
// Presence is answered right here (saved per click into the item's assessment); the condition of a
// part is assessed in the right panel. A slot with a part item in it takes its state from the item,
// so its presence cannot be set to contradict an existing part.

interface Props {
  tree: PartsTreeNode;
  selected: NodeRef;
  canEdit: boolean;
  onSelect: (ref: NodeRef) => void;
  onChanged: () => void;
}

const CHIP_LABELS: Record<string, string> = {
  Vorhanden: '✓ da',
  'Nicht vorhanden': '✕ fehlt',
  'Nicht vorgesehen': '– n. v.',
  'Fest verbaut': '▣ fest',
  true: '✓ da',
  false: '✕ fehlt',
};

const STATE_LABELS: Record<SlotState, string> = {
  unknown: 'offen',
  present: 'da · nicht bewertet',
  missing: 'fehlt',
  notApplicable: 'nicht vorgesehen',
  integrated: 'fest verbaut',
  open: 'erfasst · nicht bewertet',
  assessed: 'bewertet',
  removed: 'entnommen',
};

function rangeOf(node: PartsTreeNode): string | null {
  return node.scoreMin !== null && node.scoreMax !== null ? formatQualityScoreRange({ min: node.scoreMin, max: node.scoreMax }) : null;
}

function slotStatus(slot: PartsTreeSlot): string {
  const state = slotState(slot);
  if (state === 'assessed') {
    const ranges = slot.items.filter((n) => !n.boxId).map(rangeOf).filter(Boolean);
    return ranges.length ? `bewertet · ${ranges.join(', ')}` : 'bewertet';
  }
  if (state === 'removed') {
    const box = slot.items.find((n) => n.boxId)?.boxId;
    return box ? `entnommen · ${box}` : 'entnommen';
  }
  return STATE_LABELS[state];
}

function AnswerControl({ question, value, isDefault, disabled, onChange }: {
  question: QualityQuestion;
  value: string | null;
  isDefault: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  if (question.type === 'boolean' || (question.type === 'select' && question.values.every((v) => v in CHIP_LABELS))) {
    const values = question.type === 'boolean' ? ['true', 'false'] : question.values;
    return (
      <span className="parts-tree__chips" role="group" aria-label={question.question}>
        {values.map((v) => {
          const active = value === v;
          return (
            <button
              key={v}
              type="button"
              className={`quality-review-step__toggle parts-tree__chip${active ? ' quality-review-step__toggle--active' : ''}${active && isDefault ? ' parts-tree__chip--default' : ''}`}
              title={active && isDefault ? `${v} (Vorgabe — noch nicht bestätigt)` : v}
              disabled={disabled}
              // Clicking the stored answer again clears it; clicking a pre-set default confirms it.
              onClick={() => onChange(active && !isDefault ? '' : v)}
            >
              {CHIP_LABELS[v] ?? v}
            </button>
          );
        })}
      </span>
    );
  }
  // Spec-like slot questions (refurbishment "RAM?", "Akkuzustand?") keep their own values.
  const values = question.type === 'select' ? question.values : [];
  return (
    <select className="parts-tree__select" value={value ?? ''} disabled={disabled} aria-label={question.question} onChange={(e) => onChange(e.target.value)}>
      <option value="">{question.question}</option>
      {values.map((v) => <option key={v} value={v}>{v}</option>)}
    </select>
  );
}

function SlotRow({ node, slot, depth, selectedKey, canEdit, onSelect, onChanged, setError }: {
  node: PartsTreeNode;
  slot: PartsTreeSlot;
  depth: number;
  selectedKey: string;
  canEdit: boolean;
  onSelect: (ref: NodeRef) => void;
  onChanged: () => void;
  setError: (msg: string | null) => void;
}) {
  const [saving, setSaving] = useState(false);
  const { part } = slot;
  const state = slotState(slot);
  const inDevice = slot.items.filter((n) => !n.boxId);
  const removed = slot.items.filter((n) => n.boxId);
  const hasItem = slot.items.length > 0;
  const { value, isDefault } = effectiveAnswer(slot);

  const save = async (questionId: string, answer: string) => {
    setSaving(true);
    setError(null);
    try {
      await saveSlotAnswers(node.itemUUID, { [questionId]: answer });
      onChanged();
    } catch (err) {
      setError(`${part.label}: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  // Without an item: the slot itself (part created on first save). One item: that item.
  const ownRef: NodeRef = inDevice[0] ? { itemUUID: inDevice[0].itemUUID } : removed[0] ? { itemUUID: removed[0].itemUUID } : { parentUUID: node.itemUUID, slotKey: part.key };
  const selectable = state !== 'missing' && state !== 'notApplicable' && state !== 'integrated';
  const isSelected = nodeRefKey(ownRef) === selectedKey;
  const instances = part.multipleAllowed ? inDevice : [];

  return (
    <li className="parts-tree__slot">
      <div className={`parts-tree__row${isSelected ? ' parts-tree__row--selected' : ''}`} style={{ paddingLeft: `${depth * 18}px` }}>
        <button type="button" className="parts-tree__label link-btn" disabled={!selectable} onClick={() => onSelect(ownRef)}>
          {part.label}
        </button>
        {part.question && (
          // Presence follows the part item once there is one (in the device or removed).
          <AnswerControl
            question={part.question}
            value={hasItem && isPresenceQuestion(part) ? (part.question.type === 'boolean' ? 'true' : 'Vorhanden') : value}
            isDefault={!hasItem && isDefault}
            disabled={!canEdit || saving || (hasItem && isPresenceQuestion(part))}
            onChange={(v) => void save(part.question!.id, v)}
          />
        )}
        {part.specQuestion && (
          <AnswerControl question={part.specQuestion} value={slot.specAnswer} isDefault={false} disabled={!canEdit || saving} onChange={(v) => void save(part.specQuestion!.id, v)} />
        )}
        <span className={`parts-tree__status parts-tree__status--${state}`}>{slotStatus(slot)}</span>
      </div>
      {instances.length > 1 && (
        <ul className="parts-tree__instances">
          {instances.map((child, i) => (
            <li key={child.itemUUID}>
              <button
                type="button"
                className={`parts-tree__row link-btn${child.itemUUID === selectedKey ? ' parts-tree__row--selected' : ''}`}
                style={{ paddingLeft: `${depth * 18 + 18}px` }}
                onClick={() => onSelect({ itemUUID: child.itemUUID })}
              >
                {part.label} #{i + 1} · {child.assessed ? `bewertet ${rangeOf(child) ?? ''}` : 'nicht bewertet'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {part.multipleAllowed && inDevice.length > 0 && canEdit && (
        <button
          type="button"
          className="link-btn parts-tree__more"
          style={{ paddingLeft: `${depth * 18 + 18}px` }}
          onClick={() => onSelect({ parentUUID: node.itemUUID, slotKey: part.key })}
        >
          + weiteres {part.label}
        </button>
      )}
      {inDevice.filter((child) => child.assembly).map((child) => (
        <NodeGroups key={child.itemUUID} node={child} depth={depth + 1} selectedKey={selectedKey} canEdit={canEdit} onSelect={onSelect} onChanged={onChanged} setError={setError} />
      ))}
    </li>
  );
}

function NodeGroups({ node, depth, ...rest }: {
  node: PartsTreeNode;
  depth: number;
  selectedKey: string;
  canEdit: boolean;
  onSelect: (ref: NodeRef) => void;
  onChanged: () => void;
  setError: (msg: string | null) => void;
}) {
  const groups = groupSlotsBySteps(node);
  return (
    <>
      {groups.map((group, i) => {
        const done = group.slots.filter(isSlotDone).length;
        return (
          <details key={group.key} className="parts-tree__step" open style={{ marginLeft: `${depth * 18}px` }}>
            <summary className="parts-tree__step-head">
              <span>{group.key === '__rest' ? group.label : `${i + 1} · ${group.label}`}</span>
              <span className={`parts-tree__progress${done === group.slots.length ? ' parts-tree__progress--done' : ''}`}>{done}/{group.slots.length}</span>
            </summary>
            <ul className="parts-tree__slots">
              {group.slots.map((slot) => (
                <SlotRow key={slot.part.key} node={node} slot={slot} depth={0} {...rest} />
              ))}
            </ul>
          </details>
        );
      })}
    </>
  );
}

export default function PartsTreeView({ tree, selected, canEdit, onSelect, onChanged }: Props) {
  const [error, setError] = useState<string | null>(null);
  const selectedKey = nodeRefKey(selected);
  const rootSelected = selectedKey === tree.itemUUID;
  const range = rangeOf(tree);
  return (
    <div className="parts-tree">
      <button
        type="button"
        className={`parts-tree__root${rootSelected ? ' parts-tree__row--selected' : ''}`}
        onClick={() => onSelect({ itemUUID: tree.itemUUID })}
      >
        <strong>Gerät — Zustand</strong>
        <span className="muted">{tree.assessed ? `bewertet${range ? ` · ${range}` : ''}` : 'noch nicht bewertet'}</span>
      </button>
      {error && <p className="parts-tree__error" role="alert">{error}</p>}
      {tree.assembly ? (
        <NodeGroups node={tree} depth={0} selectedKey={selectedKey} canEdit={canEdit} onSelect={onSelect} onChanged={onChanged} setError={setError} />
      ) : (
        <p className="muted">Für diese Kategorie ist kein Aufbau hinterlegt.</p>
      )}
    </div>
  );
}
