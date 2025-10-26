import type {
  ItemCategoryDefinition,
  ItemSubcategoryDefinition
} from '../data/itemCategories';
import { itemCategories } from '../data/itemCategories';

export interface ItemSubcategoryWithParent extends ItemSubcategoryDefinition {
  parentCode: number;
  parentLabel: string;
}

export interface ItemCategoryLookups {
  haupt: Map<number, ItemCategoryDefinition>;
  unter: Map<number, ItemSubcategoryWithParent>;
}

export function buildItemCategoryLookups(): ItemCategoryLookups {
  const haupt = new Map<number, ItemCategoryDefinition>();
  const unter = new Map<number, ItemSubcategoryWithParent>();

  try {
    let previousCategoryCode = -Infinity;
    for (const category of itemCategories) {
      if (category.code <= previousCategoryCode) {
        console.warn('Item categories are not strictly ascending by code', {
          current: category.code,
          previous: previousCategoryCode
        });
      }

      if (haupt.has(category.code)) {
        console.error('Duplicate Hauptkategorie code detected', category.code);
      }

      previousCategoryCode = category.code;
      haupt.set(category.code, category);

      let previousSubCode = -Infinity;
      const seenSubCodes = new Set<number>();

      for (const subCategory of category.subcategories) {
        if (subCategory.code <= previousSubCode) {
          console.warn('Unterkategorie codes are not strictly ascending', {
            hauptkategorie: category.code,
            current: subCategory.code,
            previous: previousSubCode
          });
        }

        if (seenSubCodes.has(subCategory.code)) {
          console.error('Duplicate Unterkategorie code detected within parent', {
            hauptkategorie: category.code,
            code: subCategory.code
          });
        }

        if (unter.has(subCategory.code)) {
          console.error('Duplicate Unterkategorie code detected across parents', {
            hauptkategorie: category.code,
            code: subCategory.code
          });
        }

        seenSubCodes.add(subCategory.code);
        previousSubCode = subCategory.code;
        unter.set(subCategory.code, {
          ...subCategory,
          parentCode: category.code,
          parentLabel: category.label
        });
      }
    }

    if (haupt.size !== itemCategories.length) {
      console.error('Item category lookup size mismatch', {
        expected: itemCategories.length,
        actual: haupt.size
      });
    }
  } catch (error) {
    console.error('Failed to build item category lookup maps', error);
  }

  return { haupt, unter };
}
