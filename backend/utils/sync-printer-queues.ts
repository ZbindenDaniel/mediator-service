import { query } from '../db-client';
import { cupsLpadmin, cupsLpoptions, cupsEnable, cupsAccept } from './cups-client';

interface PrinterQueueRow {
  name: string;
  device_uri: string;
  ppd_model: string;
  media: string;
  description: string;
  enabled: boolean;
}

let syncInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Reads all enabled queues from the printer_queues table and applies them
 * to the CUPS server via lpadmin. Safe to call multiple times — lpadmin
 * modifies existing queues rather than failing if they already exist.
 */
export async function syncPrinterQueuesToCups(): Promise<void> {
  let rows: PrinterQueueRow[];
  try {
    rows = await query<PrinterQueueRow>(
      'SELECT name, device_uri, ppd_model, media, description, enabled FROM printer_queues WHERE enabled = TRUE'
    );
  } catch (err) {
    console.error('[sync-printer-queues] Failed to read printer_queues from DB', err);
    return;
  }

  if (rows.length === 0) {
    console.info('[sync-printer-queues] No enabled printer queues in DB; nothing to sync');
    return;
  }

  console.info(`[sync-printer-queues] Syncing ${rows.length} queue(s) to CUPS`);

  for (const row of rows) {
    try {
      // -E enables the queue; -v sets device URI; -m sets PPD model (omit if empty → raw/no-PPD)
      const lpadminArgs = ['-p', row.name, '-E', '-v', row.device_uri];
      if (row.ppd_model) {
        lpadminArgs.push('-m', row.ppd_model);
      } else {
        // Raw queue: PDF bytes sent unfiltered to the device. Brother QL printers require a
        // raster filter (install LPR .deb in cups/drivers/ + rebuild) — they will silently
        // discard raw PDF while CUPS still reports the job as successful.
        console.warn(`[sync-printer-queues] Queue ${row.name} has no PPD model — raw queue; Brother QL printers will silently discard raw PDF`);
      }
      await cupsLpadmin(lpadminArgs);
      if (row.media) {
        await cupsLpoptions(['-p', row.name, '-o', `media=${row.media}`]);
      }
      await cupsEnable(row.name);
      await cupsAccept(row.name);
      console.info(`[sync-printer-queues] Queue configured: ${row.name}`);
    } catch (err) {
      console.error(`[sync-printer-queues] Failed to configure queue ${row.name}`, err);
    }
  }
}

/**
 * Removes a single queue from CUPS. Called when a queue is deleted via the admin UI.
 */
export async function removePrinterQueueFromCups(name: string): Promise<void> {
  try {
    await cupsLpadmin(['-x', name]);
    console.info(`[sync-printer-queues] Removed queue from CUPS: ${name}`);
  } catch (err) {
    console.warn(`[sync-printer-queues] Could not remove queue ${name} from CUPS (may not exist)`, err);
  }
}

/**
 * Starts a background interval that re-syncs DB queues to CUPS every 2 minutes.
 * This handles cases where the CUPS container restarts without the mediator restarting.
 */
export function startPrinterQueueSyncInterval(intervalMs = 2 * 60 * 1000): void {
  if (syncInterval) return;
  syncInterval = setInterval(() => {
    syncPrinterQueuesToCups().catch((err) => {
      console.error('[sync-printer-queues] Periodic sync failed', err);
    });
  }, intervalMs);
  console.info(`[sync-printer-queues] Periodic sync started (every ${intervalMs / 1000}s)`);
}
