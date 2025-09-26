export type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

export interface ToDataURLOptions {
  margin?: number;
  scale?: number;
  errorCorrectionLevel?: ErrorCorrectionLevel;
}

export function toDataURL(text: string, options?: ToDataURLOptions): Promise<string>;
export function toDataURL(
  text: string,
  callback: (error: Error | null, url?: string) => void
): void;
export function toDataURL(
  text: string,
  options: ToDataURLOptions,
  callback: (error: Error | null, url?: string) => void
): void;

export type QRModuleMatrix = boolean[][];

export interface GenerateResult {
  modules: QRModuleMatrix;
  options: {
    margin: number;
    scale: number;
    ecc: number;
  };
  text: string;
}

export function generate(text: string, options?: ToDataURLOptions): GenerateResult;
export function renderFromMatrix(
  modules: QRModuleMatrix,
  options?: ToDataURLOptions | GenerateResult['options']
): string;
