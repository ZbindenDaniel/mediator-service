// Unsaved quality-review answers, mirrored to localStorage so a reload or a locked phone during a
// nested assessment (Laptop › Displayassembly › Webcam) loses nothing. Per-browser convenience only:
// every read/write is guarded, and the form works without it.

export interface QualityDraft {
  answers: Record<string, string>;
  notes: string;
  savedAt: string;
}

const PREFIX = 'quality-draft:';

export function readQualityDraft(key: string): QualityDraft | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as QualityDraft;
    return parsed && typeof parsed === 'object' && parsed.answers && typeof parsed.answers === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function writeQualityDraft(key: string, answers: Record<string, string>, notes: string): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify({ answers, notes, savedAt: new Date().toISOString() }));
  } catch {
    // storage full/blocked — the draft only lives in memory then
  }
}

export function clearQualityDraft(key: string): void {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}
