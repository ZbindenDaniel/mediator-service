import { EventEmitter } from 'events';
import fs from 'fs';
import os from 'os';
import path from 'path';

jest.mock('child_process', () => ({
  spawn: jest.fn(),
  spawnSync: jest.fn(() => ({ error: undefined }))
}));

const { spawn } = jest.requireMock('child_process') as { spawn: jest.Mock };

describe('renderHtmlToPdf renderer environment', () => {
  it('gives the renderer a writable HOME (www-data has none in the runtime image)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'labelpdf-env-'));
    const htmlPath = path.join(dir, 'label.html');
    fs.writeFileSync(htmlPath, '<html></html>');
    spawn.mockImplementation(() => {
      const proc = new EventEmitter() as any;
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      process.nextTick(() => proc.emit('close', 0, null));
      return proc;
    });

    const { renderHtmlToPdf } = await import('../backend/labelpdf');
    await renderHtmlToPdf({ htmlPath, rendererCommand: 'chromium', logger: { ...console, info: jest.fn() } as any });

    const env = spawn.mock.calls[0][2].env as NodeJS.ProcessEnv;
    expect(env.HOME).toBe(path.join(os.tmpdir(), 'mediator-renderer-home'));
    expect(fs.existsSync(env.HOME as string)).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
