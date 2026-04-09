import { stringifyLangChainContent } from '../utils/langchain';
import type { ChatModel } from './item-flow-extraction';

const OCR_PROMPT = `You are analyzing a photo of a device or equipment label/nameplate.
Extract the identification information visible on the label, focusing on:
- Manufacturer or brand name
- Model name or type designation
- Part number, order number, or product code
- Serial number (if clearly visible)
- Key technical ratings on the nameplate (voltage, wattage, current, frequency, etc.)

Return only the extracted identifiers, one per line, exactly as printed. Do not add explanations, headings, or formatting. Skip fields that are not visible or legible.`;

export interface OcrExtractionResult {
  text: string;
}

export async function runOcrExtraction(options: {
  llm: ChatModel;
  imageData: string;
  logger?: Partial<Pick<Console, 'info' | 'warn' | 'error'>>;
}): Promise<OcrExtractionResult | null> {
  const { llm, imageData, logger } = options;

  if (!imageData || !imageData.startsWith('data:')) {
    logger?.warn?.({ msg: '[OCR] imageData missing or not a data URL; skipping' });
    return null;
  }

  let response;
  try {
    response = await llm.invoke([
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageData } },
          { type: 'text', text: OCR_PROMPT }
        ]
      }
    ]);
  } catch (err) {
    logger?.warn?.({ err, msg: '[OCR] Vision model invocation failed; skipping label extraction' });
    return null;
  }

  const text = stringifyLangChainContent(response?.content, {
    context: 'itemFlow.ocr',
    logger
  });

  if (!text || !text.trim()) {
    logger?.warn?.({ msg: '[OCR] Vision model returned empty response' });
    return null;
  }

  return { text: text.trim() };
}
