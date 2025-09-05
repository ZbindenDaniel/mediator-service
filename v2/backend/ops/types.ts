export interface OpContext {
  queueLabel: (id: string) => void;
  log: (...a: unknown[]) => void;
}

export interface OpResult {
  ok: boolean;
  errors?: string[];
  row?: Record<string, string>;
}

export interface Op {
  name: string;
  apply: (row: Record<string, string>, ctx: OpContext) => OpResult;
}
