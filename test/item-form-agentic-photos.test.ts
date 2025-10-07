/** @jest-environment jsdom */

const React = require('react');
const { act } = require('react-dom/test-utils');
const { createRoot } = require('react-dom/client');
const ItemFormAgentic = require('../frontend/src/components/ItemForm_agentic').default;

function createFileList() {
  const files = Array.from(arguments);
  const list = { length: files.length, item: (index) => files[index] || null };
  files.forEach((file, index) => {
    list[index] = file;
  });
  return list;
}

describe('ItemForm agentic photo mode', () => {
  let container;
  let root;
  let originalFetch;
  let reportValiditySpy;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    originalFetch = global.fetch;
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ nextArtikelNummer: 'MAT-4242' })
    });
    global.fetch = fetchMock;
    reportValiditySpy = jest
      .spyOn(HTMLFormElement.prototype, 'reportValidity')
      .mockReturnValue(true);

    class MockFileReader {
      constructor() {
        this.result = null;
        this.onload = null;
        this.onerror = null;
      }

      readAsDataURL(file) {
        this.result = `data:${file && file.type ? file.type : 'image/png'};base64,MOCK_IMAGE_DATA`;
        if (typeof this.onload === 'function') {
          this.onload.call(this, new ProgressEvent('load'));
        }
      }
    }

    global.FileReader = MockFileReader;
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
      root = null;
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    if (reportValiditySpy) {
      reportValiditySpy.mockRestore();
      reportValiditySpy = null;
    }
    if (originalFetch) {
      global.fetch = originalFetch;
      originalFetch = undefined;
    }
  });

  test('submits generated material number and photo payload when starting in photo mode', async () => {
    const onSubmitPhotos = jest.fn().mockResolvedValue(undefined);
    const draft = {
      Artikelbeschreibung: 'Agentic Beschreibung'
    };

    await act(async () => {
      root.render(
        React.createElement(ItemFormAgentic, {
          draft,
          onSubmitPhotos,
          submitLabel: 'Speichern',
          isNew: true
        })
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const fileInput = container.querySelector('input[name="picture1"]');
    const submitButton = container.querySelector('button[type="submit"]');

    expect(fileInput).toBeTruthy();
    expect(submitButton).toBeTruthy();
    if (!fileInput || !submitButton) {
      throw new Error('Form controls not rendered');
    }

    const file = new File(['binary'], 'photo.png', { type: 'image/png' });
    const files = createFileList(file);

    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: files
    });

    await act(async () => {
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });

    await act(async () => {
      submitButton.click();
      await Promise.resolve();
    });

    expect(onSubmitPhotos).toHaveBeenCalledTimes(1);
    const submission = onSubmitPhotos.mock.calls[0][0];

    expect(submission.Artikel_Nummer).toBe('MAT-4242');
    expect(submission.Artikelbeschreibung).toBe('Agentic Beschreibung');
    expect(String(submission.picture1)).toContain('MOCK_IMAGE_DATA');
  });
});
