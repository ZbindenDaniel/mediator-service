export type ThemePreference = 'system' | 'light' | 'dark';

const THEME_STORAGE_KEY = 'theme';

export function getThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch (err) {
    console.error('Failed to read theme preference', err);
    return 'system';
  }
}

// 'system' removes the attribute so the prefers-color-scheme media query decides; an explicit
// choice sets data-theme on <html>, which the stylesheet's token blocks key off.
export function applyTheme(preference: ThemePreference = getThemePreference()): void {
  try {
    if (preference === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', preference);
    }
  } catch (err) {
    console.error('Failed to apply theme', err);
  }
}

export function setThemePreference(preference: ThemePreference): void {
  try {
    if (preference === 'system') {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      localStorage.setItem(THEME_STORAGE_KEY, preference);
    }
  } catch (err) {
    console.error('Failed to persist theme preference', err);
  }
  applyTheme(preference);
}
