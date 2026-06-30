// TODO(agent): Align print label type additions with backend template registry updates.
export type PrintLabelType = 'box' | 'item' | 'smallitem' | 'shelf' | 'marketingsheet';

export interface PrintLabelRequestBody {
  actor: string;
  labelType: PrintLabelType;
  /** Operator's current physical site (docs/PLANNING_multi_instance.md) — routes the job to that site's printer queue. */
  site?: string;
}

export interface PrintLabelResponsePayload {
  previewUrl?: string;
  sent?: boolean;
  reason?: string;
  error?: string;
  qrPayload?: unknown;
}
