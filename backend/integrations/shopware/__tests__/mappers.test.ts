import { ItemEinheit } from '../../../models/item';
import type { Item } from '../../../models/item';
import {
  mapItemProjectionToShopwareProduct,
  mapItemToShopwareProduct,
  mapShopwareProductToItemProjection,
  mapShopwareProductToItemRef
} from '../mappers';
import type { ShopwareItemProjection, ShopwareProductPayload } from '../types';

describe('Shopware mappers', () => {
  const baseItem: Item = {
    ItemUUID: 'item-uuid',
    Artikel_Nummer: 'SKU-123',
    BoxID: 'box-1',
    UpdatedAt: new Date('2024-01-01T00:00:00.000Z'),
    Auf_Lager: 42,
    Artikelbeschreibung: 'Sample item',
    Grafikname: 'graphic.png',
    Verkaufspreis: 19.99,
    Kurzbeschreibung: 'Short description',
    Langtext: 'Long description text',
    Hersteller: 'Acme',
    Länge_mm: 100,
    Breite_mm: 50,
    Höhe_mm: 25,
    Gewicht_kg: 1.2,
    Hauptkategorien_A: 10,
    Unterkategorien_A: 11,
    Hauptkategorien_B: 20,
    Unterkategorien_B: 21,
    Veröffentlicht_Status: '1',
    Shopartikel: 1,
    Artikeltyp: 'type-a',
    Einheit: ItemEinheit.Stk,
    EntityType: 'entity-a'
  };

  it('maps an Item into a Shopware product payload with custom fields preserved', () => {
    const payload = mapItemToShopwareProduct(baseItem);

    expect(payload).toMatchObject({
      productNumber: 'SKU-123',
      name: 'Sample item',
      description: 'Short description',
      descriptionLong: 'Long description text',
      manufacturerNumber: 'Acme',
      width: 50,
      height: 25,
      length: 100,
      weight: 1.2,
      price: 19.99,
      stock: 42,
      active: true,
      unitId: ItemEinheit.Stk,
      itemType: 'type-a'
    });

    expect(payload.customFields).toMatchObject({
      Grafikname: 'graphic.png',
      Artikelbeschreibung: 'Sample item',
      Verkaufspreis: 19.99,
      Kurzbeschreibung: 'Short description',
      Langtext: 'Long description text',
      Hersteller: 'Acme',
      Länge_mm: 100,
      Breite_mm: 50,
      Höhe_mm: 25,
      Gewicht_kg: 1.2,
      Hauptkategorien_A: 10,
      Unterkategorien_A: 11,
      Hauptkategorien_B: 20,
      Unterkategorien_B: 21,
      Veröffentlicht_Status: '1',
      Shopartikel: 1,
      Artikeltyp: 'type-a',
      Einheit: ItemEinheit.Stk,
      EntityType: 'entity-a',
      Auf_Lager: 42
    });
  });

  it('maps a Shopware product payload back into an ItemRef', () => {
    const product: ShopwareProductPayload = {
      productNumber: 'SKU-123',
      name: 'Sample item',
      description: 'Short description',
      descriptionLong: 'Long description text',
      manufacturerNumber: 'Acme',
      width: 50,
      height: 25,
      length: 100,
      weight: 1.2,
      price: 19.99,
      stock: 42,
      active: true,
      unitId: ItemEinheit.Stk,
      itemType: 'type-a',
      customFields: {
        Grafikname: 'graphic.png',
        Artikelbeschreibung: 'Sample item',
        Verkaufspreis: 19.99,
        Kurzbeschreibung: 'Short description',
        Langtext: 'Long description text',
        Hersteller: 'Acme',
        Länge_mm: 100,
        Breite_mm: 50,
        Höhe_mm: 25,
        Gewicht_kg: 1.2,
        Hauptkategorien_A: 10,
        Unterkategorien_A: 11,
        Hauptkategorien_B: 20,
        Unterkategorien_B: 21,
        Veröffentlicht_Status: '1',
        Shopartikel: 1,
        Artikeltyp: 'type-a',
        Einheit: ItemEinheit.Stk,
        EntityType: 'entity-a'
      }
    };

    const itemRef = mapShopwareProductToItemRef(product);

    expect(itemRef).toEqual({
      Artikel_Nummer: 'SKU-123',
      Grafikname: 'graphic.png',
      Artikelbeschreibung: 'Sample item',
      Verkaufspreis: 19.99,
      Kurzbeschreibung: 'Short description',
      Langtext: 'Long description text',
      Hersteller: 'Acme',
      Länge_mm: 100,
      Breite_mm: 50,
      Höhe_mm: 25,
      Gewicht_kg: 1.2,
      Hauptkategorien_A: 10,
      Unterkategorien_A: 11,
      Hauptkategorien_B: 20,
      Unterkategorien_B: 21,
      Veröffentlicht_Status: '1',
      Shopartikel: 1,
      Artikeltyp: 'type-a',
      Einheit: ItemEinheit.Stk,
      EntityType: 'entity-a'
    });
  });

  it('maps Shopware payloads into item projections with fallback stock values', () => {
    const product: ShopwareProductPayload = {
      productNumber: 'SKU-123',
      customFields: {
        Auf_Lager: 12
      }
    };

    const projection = mapShopwareProductToItemProjection(product);

    expect(projection).toEqual({
      Artikel_Nummer: 'SKU-123',
      Auf_Lager: 12
    } as ShopwareItemProjection);
  });

  it('round-trips an item projection back into a Shopware payload', () => {
    const projection: ShopwareItemProjection = {
      Artikel_Nummer: 'SKU-123',
      Grafikname: 'graphic.png',
      Artikelbeschreibung: 'Sample item',
      Verkaufspreis: 19.99,
      Kurzbeschreibung: 'Short description',
      Langtext: 'Long description text',
      Hersteller: 'Acme',
      Länge_mm: 100,
      Breite_mm: 50,
      Höhe_mm: 25,
      Gewicht_kg: 1.2,
      Hauptkategorien_A: 10,
      Unterkategorien_A: 11,
      Hauptkategorien_B: 20,
      Unterkategorien_B: 21,
      Veröffentlicht_Status: true,
      Shopartikel: 1,
      Artikeltyp: 'type-a',
      Einheit: ItemEinheit.Stk,
      EntityType: 'entity-a',
      Auf_Lager: 5
    };

    const payload = mapItemProjectionToShopwareProduct(projection);

    expect(payload.productNumber).toBe('SKU-123');
    expect(payload.customFields?.Auf_Lager).toBe(5);
    expect(payload.customFields?.Artikelbeschreibung).toBe('Sample item');
  });
});
