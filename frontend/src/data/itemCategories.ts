export interface ItemSubcategoryDefinition {
  code: number;
  label: string;
}

export interface ItemCategoryDefinition {
  code: number;
  label: string;
  subcategories: ItemSubcategoryDefinition[];
}

export const itemCategories: ItemCategoryDefinition[] = [
  {
    code: 10,
    label: 'Computer',
    subcategories: [
      {
        code: 101,
        label: 'Thin Client'
      }
    ]
  }
];

// TODO: Extend the itemCategories mapping with the remaining ERP categories once they are confirmed.
