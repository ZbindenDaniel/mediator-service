export interface ItemSubcategory {
  value: number;
  label: string;
}

export interface ItemCategory {
  value: number;
  label: string;
  subcategories: ItemSubcategory[];
}

// TODO: Expand item categories dataset once full taxonomy is available from backend.
export const itemCategories: ItemCategory[] = [
  {
    value: 175,
    label: 'Computer',
    subcategories: [
      {
        value: 177,
        label: 'Thin Client'
      }
    ]
  }
];

export function findCategoryByValue(value?: number | null): ItemCategory | undefined {
  if (typeof value !== 'number') {
    return undefined;
  }
  return itemCategories.find((category) => category.value === value);
}

export function findSubcategoryByValue(
  category: ItemCategory | undefined,
  value?: number | null
): ItemSubcategory | undefined {
  if (!category || typeof value !== 'number') {
    return undefined;
  }
  return category.subcategories.find((subcategory) => subcategory.value === value);
}
