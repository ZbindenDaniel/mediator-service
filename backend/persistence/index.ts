import { getDbClient, type DbClient } from './connection';
import type { SqlitePersistenceAdapter } from '../db';
import { createPostgresPersistenceAdapter } from './postgres-adapter';

// TODO(persistence): Once Postgres adapter is implemented migrate to async repository signatures.

export type Repository = SqlitePersistenceAdapter;

let cachedRepository: Repository | null = null;

function loadSqliteRepository(): Repository {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sqliteModule = require('../db') as typeof import('../db');
    return sqliteModule.sqlitePersistenceAdapter;
  } catch (error) {
    console.error('[persistence] Failed to load sqlite adapter module', error);
    throw error;
  }
}

function initializeRepository(client: DbClient): Repository {
  if (client.kind === 'postgres') {
    return createPostgresPersistenceAdapter(client, console);
  }
  return loadSqliteRepository();
}

export function getRepository(): Repository {
  if (cachedRepository) {
    return cachedRepository;
  }
  const client = getDbClient();
  try {
    cachedRepository = initializeRepository(client);
    return cachedRepository;
  } catch (error) {
    console.error('[persistence] Failed to initialize repository adapter', error);
    throw error;
  }
}

const repository = getRepository();

export const EVENT_LOG_LEVEL_ALLOW_LIST = repository.EVENT_LOG_LEVEL_ALLOW_LIST;
export const generateShopwareCorrelationId = repository.generateShopwareCorrelationId;
export const persistItemReference = repository.persistItemReference;
export const persistItemInstance = repository.persistItemInstance;
export const persistItemWithinTransaction = repository.persistItemWithinTransaction;
export const persistItem = repository.persistItem;
export const ensureAgenticRunSchema = repository.ensureAgenticRunSchema;
export const db = repository.db;
export const upsertBox = repository.upsertBox;
export const queueLabel = repository.queueLabel;
export const getItem = repository.getItem;
export const getItemReference = repository.getItemReference;
export const findByMaterial = repository.findByMaterial;
export const itemsByBox = repository.itemsByBox;
export const getBox = repository.getBox;
export const listBoxes = repository.listBoxes;
export const upsertAgenticRun = repository.upsertAgenticRun;
export const getAgenticRun = repository.getAgenticRun;
export const updateAgenticRunStatus = repository.updateAgenticRunStatus;
export const upsertAgenticRequestLog = repository.upsertAgenticRequestLog;
export const logAgenticRequestStart = repository.logAgenticRequestStart;
export const logAgenticRequestEnd = repository.logAgenticRequestEnd;
export const saveAgenticRequestPayload = repository.saveAgenticRequestPayload;
export const markAgenticRequestNotificationSuccess =
  repository.markAgenticRequestNotificationSuccess;
export const markAgenticRequestNotificationFailure =
  repository.markAgenticRequestNotificationFailure;
export const listPendingAgenticRequestNotifications =
  repository.listPendingAgenticRequestNotifications;
export const getAgenticRequestLog = repository.getAgenticRequestLog;
export const fetchQueuedAgenticRuns = repository.fetchQueuedAgenticRuns;
export const updateQueuedAgenticRunQueueState = repository.updateQueuedAgenticRunQueueState;
export const nextLabelJob = repository.nextLabelJob;
export const updateLabelJobStatus = repository.updateLabelJobStatus;
export const clearShopwareSyncQueue = repository.clearShopwareSyncQueue;
export const listShopwareSyncQueue = repository.listShopwareSyncQueue;
export const enqueueShopwareSyncJob = repository.enqueueShopwareSyncJob;
export const claimShopwareSyncJobs = repository.claimShopwareSyncJobs;
export const markShopwareSyncJobSucceeded = repository.markShopwareSyncJobSucceeded;
export const rescheduleShopwareSyncJob = repository.rescheduleShopwareSyncJob;
export const markShopwareSyncJobFailed = repository.markShopwareSyncJobFailed;
export const getShopwareSyncJobById = repository.getShopwareSyncJobById;
export const decrementItemStock = repository.decrementItemStock;
export const incrementItemStock = repository.incrementItemStock;
export const deleteItem = repository.deleteItem;
export const deleteBox = repository.deleteBox;
export const logEvent = repository.logEvent;
export const bulkMoveItems = repository.bulkMoveItems;
export const bulkRemoveItemStock = repository.bulkRemoveItemStock;
export const listEventsForBox = repository.listEventsForBox;
export const listEventsForItem = repository.listEventsForItem;
export const listRecentEvents = repository.listRecentEvents;
export const listRecentActivities = repository.listRecentActivities;
export const countEvents = repository.countEvents;
export const countBoxes = repository.countBoxes;
export const countItems = repository.countItems;
export const countItemsNoBox = repository.countItemsNoBox;
export const listRecentBoxes = repository.listRecentBoxes;
export const getMaxBoxId = repository.getMaxBoxId;
export const getMaxItemId = repository.getMaxItemId;
export const getMaxArtikelNummer = repository.getMaxArtikelNummer;
export const listItemReferences = repository.listItemReferences;
export const listItems = repository.listItems;
export const listItemsForExport = repository.listItemsForExport;
export const updateAgenticReview = repository.updateAgenticReview;

export type { AgenticRun, Box, Item, ItemInstance, ItemRef, LabelJob, EventLog } from '../db';
export type { ShopwareSyncQueueEntry, ShopwareSyncQueueInsert, ShopwareSyncQueueStatus } from '../db';
