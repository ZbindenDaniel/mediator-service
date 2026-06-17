import fs from 'fs';
import { spawn } from 'child_process';
import { CUPS_HOST, LPSTAT_COMMAND } from '../config';
import { getSetting } from './app-settings';

const CUPS_TIMEOUT_MS = 10_000;

// CUPS 2.4 removed CUPS-Get-Devices and CUPS-Get-PPDs from IPP. The cups container's
// entrypoint writes lpinfo output to these files so the mediator can read them without
// going through the removed IPP operations.
const DEVICES_FILE = '/run/cups/devices.txt';
const PPDS_FILE    = '/run/cups/ppds.txt';

async function runCupsCommand(cmd: string, args: string[], timeoutMs = CUPS_TIMEOUT_MS): Promise<string> {
  // Runtime-configured server (DB override > CUPS_HOST env > CUPS_SERVER socket via env)
  const host = await getSetting('printer.server', CUPS_HOST);
  return new Promise((resolve, reject) => {
    const fullArgs = host ? ['-h', host, ...args] : args;
    const proc = spawn(cmd, fullArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`[cups-client] ${cmd} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`[cups-client] ${cmd} exited ${code}: ${stderr.trim() || stdout.trim()}`));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function readFile(path: string): string | null {
  try {
    const content = fs.readFileSync(path, 'utf8').trim();
    return content.length > 0 ? content : null;
  } catch {
    return null;
  }
}

/** Run lpadmin with the given args (host flag prepended automatically). */
export async function cupsLpadmin(args: string[]): Promise<void> {
  await runCupsCommand('lpadmin', args);
}

/** Run lpoptions with the given args. */
export async function cupsLpoptions(args: string[]): Promise<void> {
  await runCupsCommand('lpoptions', args);
}

/** Run cupsenable for a named queue. */
export async function cupsEnable(queue: string): Promise<void> {
  try {
    await runCupsCommand('cupsenable', [queue]);
  } catch {
    // non-fatal: the queue may already be enabled
  }
}

/** Run cupsaccept for a named queue. */
export async function cupsAccept(queue: string): Promise<void> {
  try {
    await runCupsCommand('cupsaccept', [queue]);
  } catch {
    // non-fatal
  }
}

/**
 * Run lpinfo with the given args and return stdout.
 *
 * CUPS 2.4 removed CUPS-Get-Devices (-v) and CUPS-Get-PPDs (-m) from IPP.
 * For these two operations we first try the pre-written discovery files
 * (cups/entrypoint.sh writes them at startup and refreshes every 60 s).
 * The IPP path is kept as fallback for remote CUPS 2.3 servers.
 */
export async function cupsLpinfo(args: string[]): Promise<string> {
  if (args.includes('-v')) {
    const cached = readFile(DEVICES_FILE);
    if (cached !== null) return cached;
  }
  if (args.includes('-m')) {
    const cached = readFile(PPDS_FILE);
    if (cached !== null) return cached;
  }
  // Fallback: try IPP (works for remote CUPS ≤ 2.3, fails on CUPS 2.4)
  return runCupsCommand('lpinfo', args);
}

/** Run lpstat with the given args and return stdout. */
export async function cupsLpstat(args: string[]): Promise<string> {
  return runCupsCommand(LPSTAT_COMMAND, args);
}

/** Cancel all print jobs for a named queue. */
export async function cupsCancel(queue: string): Promise<void> {
  await runCupsCommand('cancel', ['-a', queue]);
}
