import type { PartsTreeNode, PartsTreeSlot } from '../../../models/parts-tree';
import type { AssemblyPart } from '../../../models/assembly-contract';
import { SLOT_PRESENCE_VALUES, isSlotExcludedAnswer, isSlotMissingAnswer } from '../../../models/assembly-contract';
import { ensureUser } from './user';
import type { QualityScoreChild } from '../../../models/quality-score';

export type { PartsTreeNode, PartsTreeSlot };

/**
 * What a slot row shows. `assessed`/`open` = a part item is in the device (with/without its own
 * assessment); `removed` = it went to a box; `missing`/`notApplicable`/`integrated` come from the
 * presence answer (or the contract default); `present` = "Vorhanden" without a part item yet.
 */
export type SlotState = 'unknown' | 'present' | 'missing' | 'notApplicable' | 'integrated' | 'open' | 'assessed' | 'removed';

/** A selected node: an existing item, or a slot whose part is not catalogued yet. */
export type NodeRef = { itemUUID: string } | { parentUUID: string; slotKey: string };

export function nodeRefKey(ref: NodeRef): string {
  return 'itemUUID' in ref ? ref.itemUUID : `${ref.parentUUID}~${ref.slotKey}`;
}

export function parseNodeRef(raw: string | null, rootId: string): NodeRef {
  if (!raw) return { itemUUID: rootId };
  const i = raw.indexOf('~');
  return i > 0 ? { parentUUID: raw.slice(0, i), slotKey: raw.slice(i + 1) } : { itemUUID: raw };
}

/** The answer as shown: stored, else the contract's display-only default. */
export function effectiveAnswer(slot: PartsTreeSlot): { value: string | null; isDefault: boolean } {
  if (slot.answer !== null && slot.answer !== '') return { value: slot.answer, isDefault: false };
  if (slot.part.default) return { value: slot.part.default, isDefault: true };
  return { value: null, isDefault: false };
}

export function slotState(slot: PartsTreeSlot): SlotState {
  const inDevice = slot.items.filter((n) => !n.boxId);
  if (inDevice.length > 0) return inDevice.every((n) => n.assessed) ? 'assessed' : 'open';
  if (slot.items.length > 0) return 'removed';
  const { value } = effectiveAnswer(slot);
  if (value === null) return 'unknown';
  if (isSlotMissingAnswer(value)) return 'missing';
  if (value === 'Nicht vorgesehen') return 'notApplicable';
  if (isSlotExcludedAnswer(value)) return 'integrated';
  return 'present';
}

/** True when the slot question is a plain presence question (chips), not a spec select like "RAM?". */
export function isPresenceQuestion(part: AssemblyPart): boolean {
  const q = part.question;
  if (!q) return false;
  if (q.type === 'boolean') return true;
  return q.type === 'select' && q.values.every((v) => (SLOT_PRESENCE_VALUES as readonly string[]).includes(v));
}

/** A step counts as done when every slot in it has an answer (a contract default counts). */
export function isSlotDone(slot: PartsTreeSlot): boolean {
  return slotState(slot) !== 'unknown';
}

/** A slot whose part can be opened for its own assessment. */
export function isSlotOpenable(slot: PartsTreeSlot): boolean {
  const state = slotState(slot);
  return state === 'unknown' || state === 'present' || state === 'open' || state === 'assessed';
}

export interface GroupedSlots {
  key: string;
  label: string;
  slots: PartsTreeSlot[];
}

/** Slots in work-step order; slots without a (known) step go into "Weitere Teile" at the end. */
export function groupSlotsBySteps(node: PartsTreeNode): GroupedSlots[] {
  if (!node.assembly) return [];
  const { steps, slots } = node.assembly;
  const known = new Set(steps.map((s) => s.key));
  const groups: GroupedSlots[] = steps.map((s) => ({ key: s.key, label: s.label, slots: slots.filter((sl) => sl.part.step === s.key) }));
  const rest = slots.filter((sl) => !sl.part.step || !known.has(sl.part.step));
  if (rest.length > 0) groups.push({ key: '__rest', label: steps.length > 0 ? 'Weitere Teile' : 'Teile', slots: rest });
  return groups.filter((g) => g.slots.length > 0);
}

export function findNode(root: PartsTreeNode, itemUUID: string): PartsTreeNode | null {
  if (root.itemUUID === itemUUID) return root;
  for (const slot of root.assembly?.slots ?? []) {
    for (const child of slot.items) {
      const found = findNode(child, itemUUID);
      if (found) return found;
    }
  }
  return null;
}

/** The slot an item sits in, with its parent — null for the root device. */
export function slotOf(root: PartsTreeNode, itemUUID: string): { parent: PartsTreeNode; slot: PartsTreeSlot } | null {
  for (const slot of root.assembly?.slots ?? []) {
    for (const child of slot.items) {
      if (child.itemUUID === itemUUID) return { parent: root, slot };
      const deeper = slotOf(child, itemUUID);
      if (deeper) return deeper;
    }
  }
  return null;
}

/** A node's parts as the quality score sees them (slot, still in the device, stored range). */
export function scoreChildrenOf(node: PartsTreeNode): QualityScoreChild[] {
  return (node.assembly?.slots ?? []).flatMap((slot) => slot.items.map((child) => ({
    slotKey: slot.part.key,
    inDevice: !child.boxId,
    score: child.scoreMin !== null && child.scoreMax !== null ? { min: child.scoreMin, max: child.scoreMax } : null,
  })));
}

export function findSlot(root: PartsTreeNode, parentUUID: string, slotKey: string): PartsTreeSlot | null {
  return findNode(root, parentUUID)?.assembly?.slots.find((s) => s.part.key === slotKey) ?? null;
}

/** Labels from the root down to the node, for the right panel's breadcrumb. */
export function pathTo(root: PartsTreeNode, ref: NodeRef): string[] {
  const walk = (node: PartsTreeNode, trail: string[]): string[] | null => {
    const here = [...trail, node.label];
    if ('itemUUID' in ref && node.itemUUID === ref.itemUUID) return here;
    for (const slot of node.assembly?.slots ?? []) {
      if (!('itemUUID' in ref) && node.itemUUID === ref.parentUUID && slot.part.key === ref.slotKey) return [...here, slot.part.label];
      for (const child of slot.items) {
        const found = walk(child, here);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(root, []) ?? [root.label];
}

export async function fetchPartsTree(itemUUID: string): Promise<PartsTreeNode> {
  const res = await fetch(`/api/items/${encodeURIComponent(itemUUID)}/parts-tree`);
  if (!res.ok) throw new Error(`Fehler ${res.status}`);
  return ((await res.json()) as { tree: PartsTreeNode }).tree;
}

async function errorOf(res: Response): Promise<string> {
  const data = await res.json().catch(() => ({}));
  return (data as { error?: string }).error ?? `Fehler ${res.status}`;
}

/** Presence/spec answers of slots (PATCH …/quality-review/answers); "" clears an answer. */
export async function saveSlotAnswers(itemUUID: string, answers: Record<string, string>): Promise<void> {
  const actor = await ensureUser();
  const res = await fetch(`/api/items/${encodeURIComponent(itemUUID)}/quality-review/answers`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewed_by: actor, answers }),
  });
  if (!res.ok) throw new Error(await errorOf(res));
}

/** Catalogue a reference-less part into a slot (its ID is minted from the device). */
export async function createComponent(parentUUID: string, slotKey: string): Promise<string> {
  const actor = await ensureUser();
  const res = await fetch(`/api/items/${encodeURIComponent(parentUUID)}/spare-parts/component`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actor, slotKey }),
  });
  if (!res.ok) throw new Error(await errorOf(res));
  return ((await res.json()) as { itemUUID: string }).itemUUID;
}

export async function saveOwnAssessment(itemUUID: string, answers: Record<string, string>, notes: string | null): Promise<void> {
  const actor = await ensureUser();
  const res = await fetch(`/api/items/${encodeURIComponent(itemUUID)}/quality-review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewed_by: actor, answers, notes }),
  });
  if (!res.ok) throw new Error(await errorOf(res));
}

/** Unlink and delete a part that is still in the device ("Lösen"). */
export async function detachPart(itemUUID: string): Promise<void> {
  const res = await fetch(`/api/items/${encodeURIComponent(itemUUID)}/spare-part-link`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await errorOf(res));
}
