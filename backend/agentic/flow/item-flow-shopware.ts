import { stringifyLangChainContent } from '../utils/langchain';
import { parseJsonWithSanitizer } from '../utils/json';
import type { ExtractionLogger, ChatModel } from './item-flow-extraction';
import { ShopwareDecisionSchema, type AgenticTarget } from './item-flow-schemas';

export interface ShopwareSearchResult {
  text: string;
  products: Array<Record<string, unknown> & { id?: string; url?: string; name?: string }>;
}

export interface ShopwareMatchOptions {
  llm: ChatModel;
  logger?: ExtractionLogger;
  searchTerm: string;
  targetFormat: string;
  shopwarePrompt: string | null;
  shopwareResult: ShopwareSearchResult | null;
  normalizedTarget: AgenticTarget;
  itemId: string;
}

export interface ShopwareMatchResult {
  finalData: AgenticTarget;
  sources: Array<{ title?: string; url?: string; description?: string }>;
  summary: string;
  reviewNotes: string;
  reviewedBy: string;
}

export async function resolveShopwareMatch({
  llm,
  logger,
  searchTerm,
  targetFormat,
  shopwarePrompt,
  shopwareResult,
  normalizedTarget,
  itemId
}: ShopwareMatchOptions): Promise<ShopwareMatchResult | null> {
  if (!shopwarePrompt || !Array.isArray(shopwareResult?.products) || shopwareResult.products.length === 0) {
    logger?.debug?.({ msg: 'shopware shortcut skipped - insufficient data', itemId });
    return null;
  }

  logger?.info?.({ msg: 'evaluating shopware results with llm', productCount: shopwareResult.products.length, itemId });

  try {
    const shopwareMessages = [
      { role: 'system', content: `${shopwarePrompt}\nTargetformat:\n${targetFormat}` },
      {
        role: 'user',
        content: [
          `User query: ${searchTerm}`,
          'Products:',
          JSON.stringify(shopwareResult.products, null, 2)
        ].join('\n\n')
      }
    ];

    let decisionRes;
    try {
      decisionRes = await llm.invoke(shopwareMessages);
    } catch (err) {
      logger?.error?.({ err, msg: 'shopware llm invocation failed', itemId });
      throw err;
    }

    const decisionRaw = stringifyLangChainContent(decisionRes?.content, {
      context: 'itemFlow.shopwareDecision',
      logger
    });
    let decisionContent = decisionRaw;
    const thinkMatch = decisionRaw.match(/<think>([\s\S]*?)<\/think>/i);
    if (thinkMatch) {
      if (typeof thinkMatch.index === 'number') {
        decisionContent = decisionRaw.slice(thinkMatch.index + thinkMatch[0].length).trim();
      } else {
        logger?.debug?.({ msg: 'think match missing index metadata, using full decision content', itemId });
      }
    }

    let decisionJson: unknown;
    try {
      decisionJson = parseJsonWithSanitizer(decisionContent, {
        loggerInstance: logger,
        context: { itemId, stage: 'shopware-decision' }
      });
    } catch (err) {
      logger?.warn?.({
        err,
        msg: 'shopware llm returned invalid json after sanitization',
        itemId,
        sanitizedSnippet: typeof (err as { sanitized?: string }).sanitized === 'string' ? (err as { sanitized?: string }).sanitized?.slice(0, 500) : undefined,
        rawSnippet: decisionContent.slice(0, 500)
      });
      return null;
    }

    const validatedDecision = ShopwareDecisionSchema.safeParse(decisionJson);
    if (!validatedDecision.success) {
      logger?.warn?.({ msg: 'shopware llm decision validation failed', issues: validatedDecision.error.issues, itemId });
      return null;
    }

    const decision = validatedDecision.data;
    logger?.info?.({ msg: 'shopware llm decision', isMatch: decision.isMatch, confidence: decision.confidence, itemId });
    if (!decision.isMatch || !decision.target) {
      return null;
    }

    const matchedProduct = shopwareResult.products.find((p) => p.id === decision.matchedProductId) ??
      shopwareResult.products.find((p) => Boolean(p?.url));

    if (!matchedProduct?.url) {
      logger?.warn?.({ msg: 'shopware match lacks url, proceeding without shopware shortcut', itemId });
      return null;
    }

    if (!matchedProduct || matchedProduct.id !== decision.matchedProductId) {
      logger?.warn?.({ msg: 'shopware decision referenced unknown product id', matchedProductId: decision.matchedProductId, itemId });
    }

    const finalData = { ...normalizedTarget, ...decision.target, itemUUid: normalizedTarget.itemUUid };
    const sources = [
      {
        title: matchedProduct.name || 'Shopware product',
        url: matchedProduct.url,
        description: 'Shopware Store API result'
      }
    ];

    return {
      finalData,
      sources,
      summary: `Shopware match accepted (confidence ${decision.confidence})`,
      reviewNotes: `Shopware match (confidence ${decision.confidence})`,
      reviewedBy: 'shopware-shortcut'
    };
  } catch (err) {
    logger?.error?.({ err, msg: 'shopware llm evaluation failed', itemId });
    return null;
  }
}
