import fs from 'fs';
import path from 'path';
import { listContractCodes, resolveContractReadPath } from './paths';
import { SLOT_PRESENCE_VALUES, isSlotMissingAnswer } from '../../models/assembly-contract';

// One validator for every contract entry point (Jest over shipped + overlay, `npm run contracts:check`,
// admin upload). Contracts reference each other (slot → subcategory → assembly → …), so a structural
// check per file is not enough: the set checks catch dangling targets, cycles and id collisions
// before they surface as a silently wrong quality score.

export type ContractType = 'quality' | 'specs' | 'assembly';

type Doc = Record<string, unknown>;
const QUESTION_TYPES = new Set(['select', 'boolean', 'text', 'multi']);

function isObject(v: unknown): v is Doc {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function checkWeight(where: string, w: unknown, errors: string[]): void {
  if (w === undefined) return;
  if (typeof w !== 'number' || !Number.isFinite(w) || w <= 0) errors.push(`${where}: "weight" must be a positive number`);
}

function checkImpact(where: string, impact: unknown, errors: string[]): void {
  if (impact === undefined) return;
  if (!isObject(impact)) { errors.push(`${where}: "qualityImpact" must be an object`); return; }
  for (const [k, v] of Object.entries(impact)) {
    if (typeof v !== 'number' || v < 1 || v > 5) errors.push(`${where}: qualityImpact "${k}" must be a number 1–5`);
  }
}

function checkQuestion(where: string, q: unknown, errors: string[]): void {
  if (!isObject(q)) { errors.push(`${where}: each question must be an object`); return; }
  if (typeof q.id !== 'string' || !q.id.trim()) { errors.push(`${where}: each question needs a non-empty string "id"`); return; }
  const at = `${where} question "${q.id}"`;
  if (typeof q.type !== 'string') { errors.push(`${at}: needs a string "type"`); return; }
  if (!QUESTION_TYPES.has(q.type)) errors.push(`${at}: unknown type "${q.type}"`);
  if (q.type === 'select' && (!Array.isArray(q.values) || q.values.length === 0)) errors.push(`${at}: select needs a non-empty "values" array`);
  if (q.type === 'multi') {
    if (q.values !== undefined && q.suggestions !== undefined) errors.push(`${at}: multi takes either "values" or "suggestions", not both`);
    if (isObject(q.qualityImpact)) {
      for (const k of Object.keys(q.qualityImpact)) {
        if (!/^\d+$/.test(k)) errors.push(`${at}: multi qualityImpact keys are entry counts, got "${k}"`);
      }
    }
  }
  if (q.type === 'select' && Array.isArray(q.values) && isObject(q.qualityImpact)) {
    for (const k of Object.keys(q.qualityImpact)) {
      if (!(q.values as unknown[]).includes(k)) errors.push(`${at}: qualityImpact key "${k}" is not one of its values`);
    }
  }
  if (q.showIf !== undefined && (!isObject(q.showIf) || typeof q.showIf.questionId !== 'string' || typeof q.showIf.value !== 'string')) {
    errors.push(`${at}: "showIf" needs string "questionId" and "value"`);
  }
  checkImpact(at, q.qualityImpact, errors);
  checkWeight(at, q.weight, errors);
  checkStates(at, q, errors);
  checkKnockout(at, q.knockout, errors);
  if (q.refinedBy !== undefined) {
    if (!Array.isArray(q.refinedBy) || q.refinedBy.length === 0 || !q.refinedBy.every((k) => typeof k === 'string' && k.trim())) {
      errors.push(`${at}: "refinedBy" must be a non-empty array of slot keys`);
    } else if (q.weight === undefined && q.states === undefined && q.qualityImpact === undefined) {
      errors.push(`${at}: "refinedBy" only makes sense on a scored question (weight/states)`);
    }
  }
}

function isFraction(v: unknown): boolean {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
}

function checkStates(at: string, q: Doc, errors: string[]): void {
  if (q.states === undefined) return;
  if (!isObject(q.states)) { errors.push(`${at}: "states" must be an object`); return; }
  for (const [k, v] of Object.entries(q.states)) {
    if (v !== null && !isFraction(v)) errors.push(`${at}: state "${k}" must be a fraction 0–1 or null`);
    if (q.type === 'select' && Array.isArray(q.values) && !(q.values as unknown[]).includes(k)) errors.push(`${at}: state "${k}" is not one of its values`);
    if (q.type === 'boolean' && k !== 'true' && k !== 'false') errors.push(`${at}: boolean states are "true"/"false", got "${k}"`);
    if (q.type === 'multi' && !/^\d+$/.test(k)) errors.push(`${at}: multi states are keyed by entry counts, got "${k}"`);
  }
}

function checkKnockout(at: string, k: unknown, errors: string[]): void {
  if (k === undefined) return;
  if (!isObject(k) || !isFraction(k.below) || !isFraction(k.cap)) errors.push(`${at}: "knockout" needs fractions "below" and "cap" (0–1)`);
}

/** Structural checks on one contract file. Returns all problems (empty = valid). */
export function validateContractDocument(type: ContractType, doc: unknown, name: string = type): string[] {
  const errors: string[] = [];
  if (!isObject(doc)) return [`${name}: contract must be a JSON object`];
  if (doc.version !== undefined && typeof doc.version !== 'number') errors.push(`${name}: "version" must be a number`);

  if (type === 'quality') {
    if (doc.scale !== undefined) {
      if (!isObject(doc.scale)) errors.push(`${name}: "scale" must be an object`);
      else for (const [k, v] of Object.entries(doc.scale)) if (v !== null && !isFraction(v)) errors.push(`${name}: scale "${k}" must be a fraction 0–1 or null`);
    }
    if (doc.grading !== undefined) {
      const g = doc.grading;
      if (!isObject(g) || !Array.isArray(g.bands) || !isFraction(g.maxUncertainty)) errors.push(`${name}: "grading" needs "bands" and a fraction "maxUncertainty"`);
      else for (const b of g.bands) {
        if (!isObject(b) || !isFraction(b.min) || typeof b.value !== 'number' || b.value < 1 || b.value > 5) errors.push(`${name}: each grading band needs a fraction "min" and a value 1–5`);
      }
    }
    if (!Array.isArray(doc.questions)) return [...errors, `${name}: "questions" must be an array`];
    const ids = new Set<string>();
    for (const q of doc.questions) {
      checkQuestion(name, q, errors);
      if (isObject(q) && typeof q.id === 'string') {
        if (ids.has(q.id)) errors.push(`${name}: duplicate question id "${q.id}"`);
        ids.add(q.id);
      }
    }
  } else if (type === 'specs') {
    if (!Array.isArray(doc.fields)) return [...errors, `${name}: "fields" must be an array`];
    for (const f of doc.fields) {
      if (!isObject(f)) { errors.push(`${name}: each field must be an object`); continue; }
      if (typeof f.key !== 'string' || !f.key.trim()) { errors.push(`${name}: each field needs a non-empty string "key"`); continue; }
      if (typeof f.required !== 'boolean') errors.push(`${name}: field "${f.key}" needs a boolean "required"`);
    }
    if (doc.guidance !== undefined && !Array.isArray(doc.guidance)) errors.push(`${name}: "guidance" must be an array of strings`);
  } else {
    if (!Array.isArray(doc.parts)) return [...errors, `${name}: "parts" must be an array`];
    const stepKeys = new Set<string>();
    if (doc.steps !== undefined) {
      if (!Array.isArray(doc.steps)) errors.push(`${name}: "steps" must be an array`);
      else for (const st of doc.steps) {
        if (!isObject(st) || typeof st.key !== 'string' || !st.key.trim() || typeof st.label !== 'string' || !st.label.trim()) {
          errors.push(`${name}: each step needs a non-empty "key" and "label"`);
          continue;
        }
        if (stepKeys.has(st.key)) errors.push(`${name}: duplicate step key "${st.key}"`);
        stepKeys.add(st.key);
      }
    }
    const keys = new Set<string>();
    for (const p of doc.parts) {
      if (!isObject(p)) { errors.push(`${name}: each part must be an object`); continue; }
      if (typeof p.key !== 'string' || !p.key.trim()) { errors.push(`${name}: each part needs a non-empty string "key"`); continue; }
      const at = `${name} part "${p.key}"`;
      if (keys.has(p.key)) errors.push(`${name}: duplicate part key "${p.key}"`);
      keys.add(p.key);
      if (typeof p.label !== 'string' || !p.label.trim()) errors.push(`${at}: needs a "label"`);
      if (typeof p.targetSubcategory !== 'number') errors.push(`${at}: needs a numeric "targetSubcategory"`);
      checkWeight(at, p.weight, errors);
      checkKnockout(at, p.knockout, errors);
      if (p.knockout !== undefined && p.weight === undefined) errors.push(`${at}: a slot "knockout" needs a "weight" (only weighted slots are scored as slots)`);
      if (p.question !== undefined) checkQuestion(at, p.question, errors);
      if (p.specQuestion !== undefined) checkQuestion(at, p.specQuestion, errors);
      if (p.step !== undefined && (typeof p.step !== 'string' || !stepKeys.has(p.step))) errors.push(`${at}: step "${String(p.step)}" is not declared in "steps"`);
      if (p.default !== undefined) checkSlotDefault(at, p, errors);
      // A weighted slot is scored by presence + child score; a select presence question must speak
      // the canonical values, and an own qualityImpact would score the part twice.
      if (p.weight !== undefined && isObject(p.question)) {
        const q = p.question;
        if (q.qualityImpact !== undefined) errors.push(`${at}: a weighted slot must not also carry qualityImpact on its question`);
        if (q.type === 'select' && Array.isArray(q.values)) {
          const bad = (q.values as unknown[]).filter((v) => !(SLOT_PRESENCE_VALUES as readonly unknown[]).includes(v));
          if (bad.length) errors.push(`${at}: presence values must be ${SLOT_PRESENCE_VALUES.join(' / ')} (got ${bad.join(', ')})`);
        }
      }
    }
  }
  if (type === 'assembly' && doc.askOnCreate !== undefined) {
    const partKeys = new Set(Array.isArray(doc.parts) ? doc.parts.filter(isObject).map((p) => p.key) : []);
    if (!Array.isArray(doc.askOnCreate)) errors.push(`${name}: "askOnCreate" must be an array of slot keys`);
    else for (const k of doc.askOnCreate) {
      if (typeof k !== 'string' || !partKeys.has(k)) errors.push(`${name}: askOnCreate "${String(k)}" is not a part key`);
    }
  }
  return errors;
}

// A default is shown as if answered, so it must be a real answer — and never "missing": an
// unconfirmed "Nicht vorhanden" would read as a defect nobody checked.
function checkSlotDefault(at: string, p: Doc, errors: string[]): void {
  const q = p.question;
  if (!isObject(q)) { errors.push(`${at}: "default" needs a presence "question"`); return; }
  const allowed = q.type === 'boolean' ? ['true'] : (Array.isArray(q.values) ? (q.values as unknown[]) : []);
  if (typeof p.default !== 'string' || !allowed.includes(p.default)) errors.push(`${at}: default "${String(p.default)}" is not one of its question's values`);
  else if (isSlotMissingAnswer(p.default)) errors.push(`${at}: default must not be a "missing" answer`);
}

export interface ContractSetInput {
  /** code → parsed document, per type. "general" lives in quality. */
  quality: Map<string, unknown>;
  specs: Map<string, unknown>;
  assembly: Map<string, unknown>;
  /** Known subcategory codes; when given, slot targets and file codes are checked against it. */
  knownSubcategories?: Set<number>;
  /** false = do not require a file's own code to exist (an upload may precede the category). */
  checkFileCodes?: boolean;
  /**
   * true = contracts for subcategories outside the taxonomy are unused in this deployment (e.g. the
   * shipped refurbishment files under a catalogue taxonomy): skip their code + slot-target checks.
   * List them with `unusedContractCodes`.
   */
  skipUnknownCodes?: boolean;
}

/** Contract files (type/code) whose numeric code is not in the taxonomy — unused in this deployment. */
export function unusedContractCodes(input: ContractSetInput): string[] {
  if (!input.knownSubcategories) return [];
  const unused: string[] = [];
  for (const type of ['quality', 'specs', 'assembly'] as const) {
    for (const code of input[type].keys()) {
      if (/^\d+$/.test(code) && !input.knownSubcategories.has(Number(code))) unused.push(`${type}/${code}.json`);
    }
  }
  return unused;
}

function questionsOf(doc: unknown): Doc[] {
  return isObject(doc) && Array.isArray(doc.questions) ? (doc.questions.filter(isObject) as Doc[]) : [];
}

function partsOf(doc: unknown): Doc[] {
  return isObject(doc) && Array.isArray(doc.parts) ? (doc.parts.filter(isObject) as Doc[]) : [];
}

/** Structural checks on every file plus the cross-file rules. */
export function validateContractSet(input: ContractSetInput): string[] {
  const errors: string[] = [];
  for (const type of ['quality', 'specs', 'assembly'] as const) {
    for (const [code, doc] of input[type]) {
      if (isObject(doc) && typeof doc.__parseError === 'string') errors.push(`${type}/${code}.json: invalid JSON (${doc.__parseError})`);
      else errors.push(...validateContractDocument(type, doc, `${type}/${code}.json`));
    }
  }

  const general = questionsOf(input.quality.get('general'));
  const codes = new Set<string>([...input.quality.keys(), ...input.assembly.keys()].filter((c) => c !== 'general' && /^\d+$/.test(c)));
  for (const code of codes) {
    // The merged question set an item of this subcategory is assessed with (see buildQualityCheckResponse).
    const merged: Array<{ q: Doc; src: string }> = [
      ...general.map((q) => ({ q, src: 'quality/general.json' })),
      ...partsOf(input.assembly.get(code)).flatMap((p) =>
        [p.question, p.specQuestion].filter(isObject).map((q) => ({ q: q as Doc, src: `assembly/${code}.json` }))),
      ...questionsOf(input.quality.get(`group-${Math.floor(Number(code) / 10)}`)).map((q) => ({ q, src: `quality/group-${Math.floor(Number(code) / 10)}.json` })),
      ...questionsOf(input.quality.get(code)).map((q) => ({ q, src: `quality/${code}.json` }))
    ];
    const byId = new Map<string, { q: Doc; src: string }>();
    for (const entry of merged) {
      const id = entry.q.id as string;
      const prev = byId.get(id);
      if (prev && prev.src !== entry.src) errors.push(`subcategory ${code}: question id "${id}" is defined in both ${prev.src} and ${entry.src}`);
      if (!prev) byId.set(id, entry);
    }
    const scale = isObject(input.quality.get('general')) && isObject((input.quality.get('general') as Doc).scale)
      ? ((input.quality.get('general') as Doc).scale as Doc)
      : {};
    for (const { q, src } of merged) {
      // A scored select/boolean whose answers all lack a value would be uncertain forever — almost always a typo.
      const scored = q.weight !== undefined || q.states !== undefined || q.qualityImpact !== undefined;
      if (scored && (q.type === 'select' || q.type === 'boolean')) {
        const answers = q.type === 'boolean' ? ['true', 'false'] : (Array.isArray(q.values) ? (q.values as string[]) : []);
        const valued = answers.some((a) =>
          (isObject(q.states) && typeof q.states[a] === 'number') ||
          typeof scale[a] === 'number' ||
          (isObject(q.qualityImpact) && typeof q.qualityImpact[a] === 'number'));
        if (!valued) errors.push(`${src} question "${q.id}": scored, but none of its answers has a value (states/scale)`);
      }
    }
    // refinedBy names weighted slots of this subcategory's own assembly (only they carry a part range);
    // a group contract's refinedBy must therefore fit every subcategory it applies to.
    const weightedSlots = new Set(partsOf(input.assembly.get(code)).filter((p) => p.weight !== undefined).map((p) => p.key as string));
    for (const { q, src } of merged) {
      if (!Array.isArray(q.refinedBy)) continue;
      for (const k of q.refinedBy) {
        if (!weightedSlots.has(k as string)) errors.push(`${src} question "${q.id}": refinedBy "${String(k)}" is not a weighted slot of assembly/${code}.json`);
      }
    }
    for (const { q, src } of merged) {
      if (!isObject(q.showIf)) continue;
      const target = byId.get(q.showIf.questionId as string);
      if (!target) errors.push(`${src} question "${q.id}": showIf targets unknown question "${q.showIf.questionId}" (subcategory ${code})`);
      else if (target.q.type === 'multi') errors.push(`${src} question "${q.id}": showIf cannot target multi question "${target.q.id}"`);
    }
  }

  if (input.knownSubcategories) {
    const known = input.knownSubcategories;
    const skip = (code: string) => !!input.skipUnknownCodes && /^\d+$/.test(code) && !known.has(Number(code));
    for (const type of input.checkFileCodes === false || input.skipUnknownCodes ? [] : (['quality', 'specs', 'assembly'] as const)) {
      for (const code of input[type].keys()) {
        if (/^\d+$/.test(code) && !known.has(Number(code))) errors.push(`${type}/${code}.json: subcategory ${code} does not exist in the taxonomy`);
      }
    }
    for (const [code, doc] of input.assembly) {
      if (skip(code)) continue;
      for (const p of partsOf(doc)) {
        if (typeof p.targetSubcategory === 'number' && !known.has(p.targetSubcategory)) {
          errors.push(`assembly/${code}.json part "${p.key}": targetSubcategory ${p.targetSubcategory} does not exist in the taxonomy`);
        }
      }
    }
  }

  // Cycles: a subcategory that (transitively) contains itself would recurse forever in the score.
  const edges = new Map<number, number[]>();
  for (const [code, doc] of input.assembly) {
    if (!/^\d+$/.test(code)) continue;
    edges.set(Number(code), partsOf(doc).map((p) => p.targetSubcategory).filter((t): t is number => typeof t === 'number'));
  }
  const state = new Map<number, 'visiting' | 'done'>();
  const visit = (node: number, trail: number[]): void => {
    if (state.get(node) === 'done') return;
    if (state.get(node) === 'visiting') {
      errors.push(`assembly cycle: ${[...trail.slice(trail.indexOf(node)), node].join(' → ')}`);
      return;
    }
    state.set(node, 'visiting');
    for (const next of edges.get(node) ?? []) visit(next, [...trail, node]);
    state.set(node, 'done');
  };
  for (const node of edges.keys()) visit(node, []);

  return Array.from(new Set(errors));
}

/** Reads the effective contract set (overlay wins over shipped) from disk. */
export function loadContractSetFromDisk(overrides?: { type: ContractType; code: string; doc: unknown }): ContractSetInput {
  const read = (type: ContractType): Map<string, unknown> => {
    const map = new Map<string, unknown>();
    for (const code of listContractCodes(type)) {
      try {
        map.set(code, JSON.parse(fs.readFileSync(resolveContractReadPath(path.join(type, `${code}.json`)), 'utf8')));
      } catch (err) {
        map.set(code, { __parseError: (err as Error).message });
      }
    }
    return map;
  };
  const set: ContractSetInput = { quality: read('quality'), specs: read('specs'), assembly: read('assembly') };
  if (overrides) set[overrides.type].set(overrides.code, overrides.doc);
  return set;
}
