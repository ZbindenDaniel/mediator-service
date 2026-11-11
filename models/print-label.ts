// TODO(agent): Align print label type additions with backend template registry updates.
export type PrintLabelType = 'box' | 'item' | 'smallitem' | 'shelf' | 'marketingsheet';

export interface PrintLabelRequestBody {
  actor: string;
  labelType: PrintLabelType;
}

export interface PrintLabelBrowserTarget {
  /** CORS proxy in front of CUPS, reachable from the browser's network (e.g. http://192.168.1.20:8631). */
  url: string;
  queue: string;
  /** `Authorization` header for the proxy's basic auth, when one is configured. */
  authorization?: string;
}

export interface PrintLabelResponsePayload {
  previewUrl?: string;
  sent?: boolean;
  reason?: string;
  error?: string;
  qrPayload?: unknown;
  /** 'browser' = backend rendered the PDF; the browser must send the IPP job to `printer`. */
  dispatch?: 'browser';
  pdfUrl?: string;
  jobName?: string;
  printer?: PrintLabelBrowserTarget;
}

export interface PrintBrowserResultBody {
  actor: string;
  labelType: PrintLabelType;
  entityId: string;
  sent: boolean;
  reason?: string;
  queue?: string;
}
