import { ensureUser } from '../frontend/src/lib/user';
import { dialogService } from '../frontend/src/components/dialog/dialogService';

describe('ensureUser helper', () => {
  let originalPrompt: typeof dialogService.prompt;
  let store: Map<string, string>;

  beforeEach(() => {
    originalPrompt = dialogService.prompt.bind(dialogService);
    store = new Map();
    (global as any).localStorage = {
      getItem: (key: string) => (store.has(key) ? store.get(key) : null),
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      }
    };
  });

  afterEach(() => {
    (dialogService as unknown as { prompt: typeof dialogService.prompt }).prompt = originalPrompt;
    delete (global as any).localStorage;
  });

  test('returns stored username without prompting', async () => {
    (global as any).localStorage.setItem('username', 'StoredUser');
    let promptCalls = 0;
    (dialogService as unknown as { prompt: typeof dialogService.prompt }).prompt = (async () => {
      promptCalls += 1;
      return 'NewUser';
    }) as typeof dialogService.prompt;

    const result = await ensureUser();
    expect(result).toBe('StoredUser');
    expect(promptCalls).toBe(0);
  });

  test('prompts and persists username when missing', async () => {
    let promptCalls = 0;
    (dialogService as unknown as { prompt: typeof dialogService.prompt }).prompt = (async () => {
      promptCalls += 1;
      return '  DialogUser  ';
    }) as typeof dialogService.prompt;

    const result = await ensureUser();

    expect(result).toBe('DialogUser');
    expect(promptCalls).toBe(1);
    expect((global as any).localStorage.getItem('username')).toBe('DialogUser');
  });

  test('returns empty string when dialog is cancelled', async () => {
    (dialogService as unknown as { prompt: typeof dialogService.prompt }).prompt = (async () => null) as typeof dialogService.prompt;

    const result = await ensureUser();

    expect(result).toBe('');
    expect((global as any).localStorage.getItem('username')).toBeNull();
  });
});
