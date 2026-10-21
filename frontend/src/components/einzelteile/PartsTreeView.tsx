import React, { useState } from 'react';
import QualityBadge from '../QualityBadge';
import type { PartsTreeNode, PartsTreeSlot, NodeRef, SlotState } from '../../lib/partsTree';
import { effectiveAnswer, groupSlotsBySteps, isPresenceQuestion, isSlotDone, nodeRefKey, saveSlotAnswers, slotState } from '../../lib/partsTree';
import { formatQualityScoreRange } from '../../../../models/quality-score';
import type { QualityQuestion } from '../../../../models/quality-contract';

// Left side of the Einzelteile page: the device as the root of a tree, its work steps as branches,
// the parts as leaves (sub-assemblies branch again). Presence is answered right in the row (saved per
// click); clicking a name opens that node's condition on the right. A slot with a part item in it takes
// its state from the item, so its presence cannot be set to contradict an existing part.

interface Props {
  tree: PartsTreeNode;
  selected: NodeRef;
  canEdit: boolean;
  onSelect: (ref: NodeRef) => void;
  onChanged: () => void;
}

interface RowContext {
  selectedKey: string;
  canEdit: boolean;
  onSelect: (ref: NodeRef) => void;
  onChanged: () => void;
  setError: (msg: string | null) => void;
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
      <span className="ptree__chips" role="group" aria-label={question.question}>
        {values.map((v) => {
          const active = value === v;
          return (
            <button
              key={v}
              type="button"
              className={`ptree__chip${active ? ' ptree__chip--active' : ''}${active && isDefault ? ' ptree__chip--default' : ''}`}
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
    <select className="ptree__select" value={value ?? ''} disabled={disabled} aria-label={question.question} onChange={(e) => onChange(e.target.value)}>
      <option value="">{question.question}</option>
      {values.map((v) => <option key={v} value={v}>{v}</option>)}
    </select>
  );
}

function SlotRow({ node, slot, ctx }: { node: PartsTreeNode; slot: PartsTreeSlot; ctx: RowContext }) {
  const [saving, setSaving] = useState(false);
  const { part } = slot;
  const state = slotState(slot);
  const inDevice = slot.items.filter((n) => !n.boxId);
  const removed = slot.items.filter((n) => n.boxId);
  const hasItem = slot.items.length > 0;
  const { value, isDefault } = effectiveAnswer(slot);

  const save = async (questionId: string, answer: string) => {
    setSaving(true);
    ctx.setError(null);
    try {
      await saveSlotAnswers(node.itemUUID, { [questionId]: answer });
      ctx.onChanged();
    } catch (err) {
      ctx.setError(`${part.label}: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  // Without an item: the slot itself (the part is created on its first save). Otherwise that item.
  const item = inDevice[0] ?? removed[0] ?? null;
  const ownRef: NodeRef = item ? { itemUUID: item.itemUUID } : { parentUUID: node.itemUUID, slotKey: part.key };
  const selectable = state !== 'missing' && state !== 'notApplicable' && state !== 'integrated';
  const extraInstances = part.multipleAllowed ? inDevice.slice(1) : [];
  const children = inDevice.filter((child) => child.assembly);

  return (
    <li className={`ptree__item ptree__item--${state}`}>
      <div className={`ptree__row${nodeRefKey(ownRef) === ctx.selectedKey ? ' ptree__row--selected' : ''}`}>
        <button type="button" className="ptree__name" disabled={!selectable} onClick={() => ctx.onSelect(ownRef)}>
          <span className="ptree__label">{part.label}</span>
          {item && <span className="ptree__id">{item.itemUUID}</span>}
        </button>
        <span className="ptree__controls">
          {part.question && !(hasItem && isPresenceQuestion(part)) && (
            // Once a part item sits in the slot its presence is the item itself — no chips to contradict it.
            <AnswerControl
              question={part.question}
              value={value}
              isDefault={isDefault}
              disabled={!ctx.canEdit || saving}
              onChange={(v) => void save(part.question!.id, v)}
            />
          )}
          {part.specQuestion && (
            <AnswerControl question={part.specQuestion} value={slot.specAnswer} isDefault={false} disabled={!ctx.canEdit || saving} onChange={(v) => void save(part.specQuestion!.id, v)} />
          )}
        </span>
        <span className="ptree__status">
          {state === 'assessed' && item ? (
            <>
              <QualityBadge value={item.quality} compact />
              <span>{rangeOf(item) ?? 'bewertet'}</span>
            </>
          ) : (
            slotStatus(slot)
          )}
        </span>
      </div>
      {(extraInstances.length > 0 || (part.multipleAllowed && inDevice.length > 0 && ctx.canEdit)) && (
        <ul className="ptree__list">
          {extraInstances.map((child, i) => (
            <li key={child.itemUUID} className="ptree__item">
              <div className={`ptree__row${child.itemUUID === ctx.selectedKey ? ' ptree__row--selected' : ''}`}>
                <button type="button" className="ptree__name" onClick={() => ctx.onSelect({ itemUUID: child.itemUUID })}>
                  <span className="ptree__label">{part.label} {i + 2}</span>
                  <span className="ptree__id">{child.itemUUID}</span>
                </button>
                <span className="ptree__controls" />
                <span className="ptree__status">{child.assessed ? rangeOf(child) ?? 'bewertet' : 'nicht bewertet'}</span>
              </div>
            </li>
          ))}
          {part.multipleAllowed && inDevice.length > 0 && ctx.canEdit && (
            <li className="ptree__item">
              <button type="button" className="ptree__add" onClick={() => ctx.onSelect({ parentUUID: node.itemUUID, slotKey: part.key })}>
                + weiteres {part.label}
              </button>
            </li>
          )}
        </ul>
      )}
      {children.map((child) => (
        <StepBranches key={child.itemUUID} node={child} ctx={ctx} />
      ))}
    </li>
  );
}

function StepBranches({ node, ctx }: { node: PartsTreeNode; ctx: RowContext }) {
  const groups = groupSlotsBySteps(node);
  if (groups.length === 0) return null;
  return (
    <ul className="ptree__list">
      {groups.map((group, i) => {
        const done = group.slots.filter(isSlotDone).length;
        const complete = done === group.slots.length;
        return (
          <li key={group.key} className="ptree__item ptree__item--step">
            <details open>
              <summary className="ptree__step">
                <span className="ptree__step-label">{group.key === '__rest' ? group.label : `${i + 1} · ${group.label}`}</span>
                <span className={`ptree__progress${complete ? ' ptree__progress--done' : ''}`}>
                  <span className="ptree__progress-bar" style={{ width: `${Math.round((done / group.slots.length) * 100)}%` }} />
                  <span className="ptree__progress-text">{done}/{group.slots.length}</span>
                </span>
              </summary>
              <ul className="ptree__list">
                {group.slots.map((slot) => <SlotRow key={slot.part.key} node={node} slot={slot} ctx={ctx} />)}
              </ul>
            </details>
          </li>
        );
      })}
    </ul>
  );
}

export default function PartsTreeView({ tree, selected, canEdit, onSelect, onChanged }: Props) {
  const [error, setError] = useState<string | null>(null);
  const selectedKey = nodeRefKey(selected);
  const ctx: RowContext = { selectedKey, canEdit, onSelect, onChanged, setError };
  const range = rangeOf(tree);
  return (
    <div className="ptree">
      {error && <p className="ptree__error" role="alert">{error}</p>}
      <ul className="ptree__list ptree__list--root">
        <li className="ptree__item ptree__item--device">
          <div className={`ptree__row ptree__row--device${selectedKey === tree.itemUUID ? ' ptree__row--selected' : ''}`}>
            <button type="button" className="ptree__name" onClick={() => onSelect({ itemUUID: tree.itemUUID })}>
              <span className="ptree__label">{tree.label}</span>
              <span className="ptree__id">Gerät · {tree.itemUUID}</span>
            </button>
            <span className="ptree__controls" />
            <span className="ptree__status">
              {tree.assessed ? (
                <>
                  <QualityBadge value={tree.quality} compact />
                  <span>{range ?? 'bewertet'}</span>
                </>
              ) : (
                'noch nicht bewertet'
              )}
            </span>
          </div>
          {tree.assembly ? (
            <StepBranches node={tree} ctx={ctx} />
          ) : (
            <p className="muted ptree__empty">Für diese Kategorie ist kein Aufbau hinterlegt.</p>
          )}
        </li>
      </ul>
    </div>
  );
}
