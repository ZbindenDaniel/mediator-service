// TODO(agent): Align print label type additions with backend template registry updates.
export type PrintLabelType = 'box' | 'item' | 'smallitem' | 'shelf';

export interface PrintLabelRequestBody {
  actor: string;
  labelType: PrintLabelType;
}

export interface PrintLabelResponsePayload {
  previewUrl?: string;
  sent?: boolean;
  reason?: string;
  error?: string;
  qrPayload?: unknown;
}
