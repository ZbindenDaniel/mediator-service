import fs from 'fs';
import os from 'os';
import path from 'path';
import { EventEmitter } from 'events';

jest.mock('../backend/labelpdf', () => ({
  renderHtmlToPdf: jest.fn()
}));

jest.mock('child_process', () => {
  const actual = jest.requireActual('child_process');
  return {
    ...actual,
    spawn: jest.fn()
  };
});

const spawn = jest.requireMock('child_process').spawn as jest.Mock;
const { renderHtmlToPdf } = jest.requireMock('../backend/labelpdf') as {
  renderHtmlToPdf: jest.Mock;
};

describe('printFile rendering pipeline', () => {
  const originalQueue = process.env.PRINTER_QUEUE;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.PRINTER_QUEUE = 'TestQueue';
  });

  afterEach(() => {
    process.env.PRINTER_QUEUE = originalQueue;
  });

  test('renders HTML to PDF before printing', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'print-render-'));
    const htmlPath = path.join(tmpDir, 'label.html');
    fs.writeFileSync(htmlPath, '<html><body>label</body></html>');
    const pdfPath = path.join(tmpDir, 'label.pdf');

    renderHtmlToPdf.mockImplementation(async () => {
      fs.writeFileSync(pdfPath, 'pdf');
      return pdfPath;
    });

    spawn.mockImplementation(() => {
      const proc = new EventEmitter() as any;
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      process.nextTick(() => {
        proc.emit('close', 0, null);
      });
      return proc;
    });

    let result;
    await jest.isolateModulesAsync(async () => {
      const { printFile } = await import('../backend/print');
      result = await printFile({
        filePath: htmlPath,
        jobName: 'Test Job',
        renderMode: 'html-to-pdf'
      });
    });

    expect(renderHtmlToPdf).toHaveBeenCalledTimes(1);
    expect(renderHtmlToPdf).toHaveBeenCalledWith(
      expect.objectContaining({ htmlPath, rendererCommand: undefined })
    );
    expect(spawn).toHaveBeenCalledWith('lp', expect.arrayContaining([pdfPath]), expect.anything());
    expect(result.sent).toBe(true);
    expect(result.artifactPath).toBe(pdfPath);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
