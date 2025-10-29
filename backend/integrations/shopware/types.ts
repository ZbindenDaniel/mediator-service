import type { Item, ItemRef } from '../../../models/item';

export type ShopwareLogger = Pick<Console, 'info' | 'warn' | 'error'>;

export interface ShopwareRetryConfig {
  retries: number;
  minDelayMs: number;
  maxDelayMs?: number;
  backoffFactor?: number;
}

export interface ShopwareClientOptions {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  scope?: string;
  tokenEndpoint?: string;
  fetchImpl?: typeof fetch;
  logger?: ShopwareLogger;
  retry?: Partial<ShopwareRetryConfig>;
  sleep?: (delayMs: number) => Promise<void>;
}

export interface ShopwareTokenResponse {
  access_token: string;
  expires_in: number;
  token_type?: string;
}

export type ShopwareProductCustomFields = Partial<Omit<ItemRef, 'Artikel_Nummer'>> & {
  Auf_Lager?: number | null;
};

export interface ShopwareProductPayload {
  id?: string;
  productNumber: string;
  name?: string | null;
  description?: string | null;
  descriptionLong?: string | null;
  manufacturerNumber?: string | null;
  width?: number | null;
  height?: number | null;
  length?: number | null;
  weight?: number | null;
  price?: number | null;
  stock?: number | null;
  active?: boolean | null;
  unitId?: string | null;
  customFields?: ShopwareProductCustomFields | null;
  itemType?: string | null;
}

export type ShopwareItemProjection = Pick<Item, 'Auf_Lager'> & ItemRef;
