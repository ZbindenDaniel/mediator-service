// Types for the device intake API.

export type IntakeNextStep = 'select_ref' | 'quality' | 'phase2';

// A generic sub-device the intake image detected — a disk, a PCI card (GPU/NIC/…), RAM, etc.
// Extensible on purpose: `kind` names the family, `attributes` is an open bag for anything the
// image learns in the future. Two fields drive behavior:
//   • `serial` (with `wwn` as a fallback key) — when present and usable, the component is
//     materialized as an in-device item and its serial-addressed reports key on it. When absent
//     (typical for PCI cards), the component is NOT auto-created; it only fills assembly info.
//   • `slotKey` — the assembly-contract slot it fills (e.g. "gpu", "storage"), used to pre-fill
//     the corresponding presence/spec questions.
export interface IntakeComponent {
  kind: string;                 // 'disk' | 'gpu' | 'network' | 'pci' | 'memory' | … (open)
  slotKey?: string | null;
  serial?: string | null;
  wwn?: string | null;
  vendor?: string | null;
  model?: string | null;
  type?: string | null;
  sizeGb?: number | null;
  attributes?: Record<string, string> | null;
}

// Shorthand for a disk-kind component (name → slotKey). Accepted for convenience; normalized
// into IntakeComponent (kind:'disk') server-side.
export interface IntakeDisk {
  name: string;
  sizeGb: number;
  type?: string;
  serial?: string | null;
  wwn?: string | null;
  model?: string | null;
}

export interface IntakeScanPayload {
  serial?: string | null;
  mac?: string | null;
  vendor?: string | null;
  model?: string | null;
  cpu?: string | null;
  ramMb?: number | null;
  // Canonical, general list of detected sub-devices.
  components?: IntakeComponent[] | null;
  // Convenience shorthand for disks; folded into `components` (kind:'disk').
  disks?: IntakeDisk[] | null;
  batteryPercent?: number | null;
}

export interface IntakeRefCandidate {
  artikelNummer: string;
  hersteller: string | null;
  kurzbeschreibung: string | null;
  hauptkategorienA: number | null;
  unterkategorienA: number | null;
}

export interface IntakeQuestion {
  id: string;
  type: 'select' | 'boolean' | 'text';
  question: string;
  values?: string[];
  suggestions?: string[];
  specField?: string;
  defaultValue?: string;
  showIf?: { questionId: string; value: string };
}

export interface IntakeStartResponse {
  intakeKey: string;
  nextStep: IntakeNextStep;
  // select_ref
  candidates?: IntakeRefCandidate[];
  // Scanned identity echoed back so the TUI can pre-fill the new-reference fields
  scan?: { vendor: string | null; model: string | null };
  // quality
  itemUUID?: string;
  qualityQuestions?: IntakeQuestion[];
  // phase2
  item?: {
    itemUUID: string;
    artikelNummer: string;
    hersteller: string | null;
    kurzbeschreibung: string | null;
    quality: number | null;
  };
}

export interface IntakeAnswerRefBody {
  type: 'ref';
  artikelNummer?: string;
  newRef?: {
    Hersteller: string;
    // Optional: defaults to the scanned model (scanPayload.model), which is the model name
    Kurzbeschreibung?: string;
    Hauptkategorien_A: number;
    Unterkategorien_A: number;
  };
  scanPayload: IntakeScanPayload;
}

export interface IntakeAnswerQualityBody {
  type: 'quality';
  qualityAnswers: Record<string, string>;
  // Free-form instance specs written by the script. Keys must match the spec contract
  // (contracts/specs/<subcat>.json) — alignment is by convention, not automatic. These win
  // over both scan-derived and questionnaire-derived specs.
  instanceSpecs?: Record<string, string>;
  // Optional: echo the scan so the server can back-fill scan-derived required specs
  // (Prozessor/RAM/Speicher) for anything the script/operator did not provide.
  scanPayload?: IntakeScanPayload;
}

export type IntakeAnswerBody = IntakeAnswerRefBody | IntakeAnswerQualityBody;

export interface IntakeAnswerResponse {
  nextStep: IntakeNextStep;
  itemUUID?: string;
  qualityQuestions?: IntakeQuestion[];
  summary?: {
    itemUUID: string;
    artikelNummer: string;
    hersteller: string | null;
    kurzbeschreibung: string | null;
    quality: number | null;
    qualityTag: string | null;
  };
}

export interface IntakeCategoryEntry {
  hauptkategorienA: number;
  unterkategorienA: number;
  label: string;
}
