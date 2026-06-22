// Types for the device intake API.

export type IntakeNextStep = 'select_ref' | 'quality' | 'phase2';

export interface IntakeScanPayload {
  serial?: string | null;
  mac?: string | null;
  vendor?: string | null;
  model?: string | null;
  cpu?: string | null;
  ramMb?: number | null;
  disks?: Array<{ name: string; sizeGb: number; type?: string }> | null;
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
    Kurzbeschreibung: string;
    Hauptkategorien_A: number;
    Unterkategorien_A: number;
  };
  scanPayload: IntakeScanPayload;
}

export interface IntakeAnswerQualityBody {
  type: 'quality';
  qualityAnswers: Record<string, string>;
  instanceSpecs?: Record<string, string>;
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
