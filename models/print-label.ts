export type PrintLabelType = 'box' | 'item' | 'shelf';

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
