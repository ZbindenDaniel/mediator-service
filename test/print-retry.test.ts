import fs from 'fs';
import os from 'os';
import path from 'path';
import { EventEmitter } from 'events';

jest.mock('child_process', () => {
  const actual = jest.requireActual('child_process');
  return {
    ...actual,
    spawn: jest.fn()
  };
});

const spawn = jest.requireMock('child_process').spawn as jest.Mock;

type SpawnSpec = {
  event: 'close' | 'error';
  code?: number;
  signal?: NodeJS.Signals | null;
  stderr?: string;
  stdout?: string;
  error?: Error;
};

function createMockProcess(spec: SpawnSpec): EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: jest.Mock;
} {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: jest.Mock;
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = jest.fn();

  process.nextTick(() => {
    if (spec.stdout) {
      proc.stdout.emit('data', Buffer.from(spec.stdout));
    }
    if (spec.stderr) {
      proc.stderr.emit('data', Buffer.from(spec.stderr));
    }

    if (spec.event === 'error') {
      proc.emit('error', spec.error ?? new Error('spawn_error'));
      return;
    }

    proc.emit('close', spec.code ?? 0, spec.signal ?? null);
  });

  return proc;
}

describe('print retry behavior', () => {
  const originalEnv = {
    PRINTER_QUEUE: process.env.PRINTER_QUEUE,
    PRINT_RETRY_ATTEMPTS: process.env.PRINT_RETRY_ATTEMPTS,
    PRINT_RETRY_BASE_MS: process.env.PRINT_RETRY_BASE_MS
  };

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Math, 'random').mockReturnValue(0);
    process.env.PRINTER_QUEUE = 'RetryQueue';
    process.env.PRINT_RETRY_ATTEMPTS = '3';
    process.env.PRINT_RETRY_BASE_MS = '1';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env.PRINTER_QUEUE = originalEnv.PRINTER_QUEUE;
    process.env.PRINT_RETRY_ATTEMPTS = originalEnv.PRINT_RETRY_ATTEMPTS;
    process.env.PRINT_RETRY_BASE_MS = originalEnv.PRINT_RETRY_BASE_MS;
  });

  test('retries transient print failure and then succeeds', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'print-retry-success-'));
    const inputPath = path.join(tmpDir, 'label.pdf');
    fs.writeFileSync(inputPath, 'pdf');

    spawn
      .mockImplementationOnce(() =>
        createMockProcess({
          event: 'close',
          code: 1,
          stderr: 'connect failed: Connection refused'
        })
      )
      .mockImplementationOnce(() =>
        createMockProcess({
          event: 'close',
          code: 0,
          stdout: 'request id is RetryQueue-123 (1 file(s))'
        })
      );

    let result: Awaited<ReturnType<typeof import('../backend/print')['printFile']>>;
    await jest.isolateModulesAsync(async () => {
      const { printFile } = await import('../backend/print');
      result = await printFile({ filePath: inputPath, jobName: 'Retry Job' });
    });

    expect(spawn).toHaveBeenCalledTimes(2);
    expect(result!.sent).toBe(true);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns failure after repeated transient status errors', async () => {
    spawn
      .mockImplementationOnce(() =>
        createMockProcess({
          event: 'close',
          code: 1,
          stderr: 'network is unreachable while contacting server'
        })
      )
      .mockImplementationOnce(() =>
        createMockProcess({
          event: 'close',
          code: 1,
          stderr: 'network is unreachable while contacting server'
        })
      )
      .mockImplementationOnce(() =>
        createMockProcess({
          event: 'close',
          code: 1,
          stderr: 'network is unreachable while contacting server'
        })
      );

    let result: Awaited<ReturnType<typeof import('../backend/print')['testPrinterConnection']>>;
    await jest.isolateModulesAsync(async () => {
      const { testPrinterConnection } = await import('../backend/print');
      result = await testPrinterConnection('RetryQueue', 1000);
    });

    expect(spawn).toHaveBeenCalledTimes(3);
    expect(result!).toEqual({ ok: false, reason: 'network is unreachable while contacting server' });
  });

  test('does not retry non-transient print failures', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'print-no-retry-'));
    const inputPath = path.join(tmpDir, 'label.pdf');
    fs.writeFileSync(inputPath, 'pdf');

    spawn.mockImplementationOnce(() =>
      createMockProcess({
        event: 'close',
        code: 1,
        stderr: 'lp: Error - The printer or class does not exist.'
      })
    );

    let result: Awaited<ReturnType<typeof import('../backend/print')['printFile']>>;
    await jest.isolateModulesAsync(async () => {
      const { printFile } = await import('../backend/print');
      result = await printFile({ filePath: inputPath, jobName: 'No Retry Job' });
    });

    expect(spawn).toHaveBeenCalledTimes(1);
    expect(result!.sent).toBe(false);
    expect(result!.reason).toContain('does not exist');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
