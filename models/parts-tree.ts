import type { AssemblyPart, AssemblyStep } from './assembly-contract';

/**
 * One catalogued item in the Einzelteile tree (GET /api/items/:id/parts-tree). The tree is built
 * from the assembly contracts down from the device: each node lists its contract's slots, and each
 * slot the part items sitting (or having sat) in it, which are nodes again.
 */
export interface PartsTreeNode {
  itemUUID: string;
  artikelNummer: string | null;
  label: string;
  /** Effective subcategory (the slot's target for an article-less part). */
  subCategory: number | null;
  /** Set once the part is out of the device (in a box). */
  boxId: string | null;
  /** The item has an assessment of its own. */
  assessed: boolean;
  scoreMin: number | null;
  scoreMax: number | null;
  quality: number | null;
  /** null when the item's subcategory has no assembly contract (a leaf part). */
  assembly: { steps: AssemblyStep[]; slots: PartsTreeSlot[] } | null;
}

export interface PartsTreeSlot {
  part: AssemblyPart;
  /** Stored presence/spec answers on the parent's assessment (null = unanswered). */
  answer: string | null;
  specAnswer: string | null;
  /** Part items linked to this slot, in-device and removed. */
  items: PartsTreeNode[];
}
