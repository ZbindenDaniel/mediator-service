import fs from 'fs';
import path from 'path';

// Contract files stay file-based (see docs/PLANNING_TAXONOMY_EXTERNALIZATION.md Phase 4).
// Runtime editability comes from a writable OVERLAY directory that takes precedence over the
// shipped defaults: reads check the overlay first, uploads write only to the overlay. The overlay
// is opt-in (CONTRACTS_OVERLAY_DIR); unset → shipped contracts are read-only and uploads are refused.
// Read at call time (not module load) so tests and redeploys can point it wherever.

// Shipped defaults: <root>/contracts (dev: repo/contracts; prod: dist/contracts — build copies it).
export const SHIPPED_CONTRACTS_DIR = path.resolve(__dirname, '..', '..', 'contracts');

export function contractOverlayDir(): string | null {
  const dir = (process.env.CONTRACTS_OVERLAY_DIR || '').trim();
  return dir ? path.resolve(dir) : null;
}

export function isContractOverlayEnabled(): boolean {
  return contractOverlayDir() !== null;
}

/** Resolves a contract file for READING: overlay copy if present, else the shipped default. `rel` e.g. "specs/109.json". */
export function resolveContractReadPath(rel: string): string {
  const overlay = contractOverlayDir();
  if (overlay) {
    const candidate = path.join(overlay, rel);
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(SHIPPED_CONTRACTS_DIR, rel);
}

/** Absolute path a WRITE (upload) targets in the overlay, or null when the overlay is disabled. */
export function contractOverlayWritePath(rel: string): string | null {
  const overlay = contractOverlayDir();
  return overlay ? path.join(overlay, rel) : null;
}

/** Lists contract codes for a type ("quality" | "specs" | "assembly") as the union of shipped + overlay files. */
export function listContractCodes(type: string): string[] {
  const keys = new Set<string>();
  for (const base of [SHIPPED_CONTRACTS_DIR, contractOverlayDir()].filter(Boolean) as string[]) {
    try {
      for (const f of fs.readdirSync(path.join(base, type))) {
        if (f.endsWith('.json')) keys.add(f.replace(/\.json$/, ''));
      }
    } catch {
      // dir may not exist (no overlay yet, or type absent) — skip
    }
  }
  return Array.from(keys);
}
