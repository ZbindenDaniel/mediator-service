import type { PromptDialogOptions } from '../components/dialog/DialogProvider';
import { dialogService } from '../components/dialog/dialogService';

const USERNAME_STORAGE_KEY = 'username';

export function setUser(username: string): void {
  try {
    localStorage.setItem(USERNAME_STORAGE_KEY, username);
  } catch (err) {
    console.error('Failed to persist username', err);
  }
}

export function getUser(): string {
  try {
    return localStorage.getItem(USERNAME_STORAGE_KEY) || '';
  } catch (err) {
    console.error('Failed to read username', err);
    return '';
  }
}

export async function ensureUser(
  options: Partial<PromptDialogOptions> = {}
): Promise<string> {
  const existing = getUser().trim();
  if (existing) {
    return existing;
  }

  const promptOptions: PromptDialogOptions = {
    title: options.title ?? 'Benutzername',
    message: options.message ?? 'Bitte geben Sie Ihren Benutzernamen ein:',
    confirmLabel: options.confirmLabel,
    cancelLabel: options.cancelLabel,
    defaultValue: options.defaultValue ?? '',
    placeholder: options.placeholder,
  };

  try {
    const response = await dialogService.prompt(promptOptions);
    const trimmed = (response ?? '').trim();
    if (!trimmed) {
      console.info('Username prompt cancelled or empty response.');
      return '';
    }
    setUser(trimmed);
    console.log('Username persisted after dialog interaction.');
    return trimmed;
  } catch (err) {
    console.error('Failed to acquire username via dialog', err);
    return '';
  }
}
