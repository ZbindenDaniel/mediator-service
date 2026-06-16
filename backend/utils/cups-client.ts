import { spawn } from 'child_process';
import { CUPS_HOST, LPSTAT_COMMAND } from '../config';
import { getSetting } from './app-settings';

const CUPS_TIMEOUT_MS = 10_000;

async function runCupsCommand(cmd: string, args: string[], timeoutMs = CUPS_TIMEOUT_MS): Promise<string> {
  // Runtime-configured server (DB override > CUPS_HOST env > Unix socket)
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

/** Run lpinfo with the given args and return parsed lines. */
export async function cupsLpinfo(args: string[]): Promise<string> {
  return runCupsCommand('lpinfo', args);
}

/** Run lpstat with the given args and return stdout. */
export async function cupsLpstat(args: string[]): Promise<string> {
  return runCupsCommand(LPSTAT_COMMAND, args);
}
