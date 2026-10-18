/**
 * Light / dark theme — the only place that knows how the theme is stored,
 * detected and applied. The theme is an attribute on <html>
 * (data-theme="light" | "dark") consumed by the tokens in styles/tokens.css.
 *
 * index.html runs a tiny inline copy of `resolveInitialTheme` before the app
 * loads so the first paint already uses the right theme (no flash). Keep the
 * storage key in sync with that script.
 */

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'skytop-theme';

const THEME_COLORS: Record<Theme, string> = { light: '#7422f0', dark: '#1b1826' };

const darkQuery = () =>
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

/** The user's explicit choice, if any (storage may be unavailable). */
export const readStoredTheme = (): Theme | null => {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
};

export const storeTheme = (theme: Theme): void => {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* private mode / blocked storage: the choice just won't persist */
  }
};

export const systemTheme = (): Theme => (darkQuery()?.matches ? 'dark' : 'light');

/** Saved choice first, otherwise the operating-system preference. */
export const resolveInitialTheme = (): Theme => readStoredTheme() ?? systemTheme();

export const applyTheme = (theme: Theme): void => {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
};

/** Follows OS changes while the user has not chosen a theme explicitly. */
export const onSystemThemeChange = (listener: (theme: Theme) => void): (() => void) => {
  const query = darkQuery();
  if (!query) return () => undefined;
  const handler = (event: MediaQueryListEvent) => listener(event.matches ? 'dark' : 'light');
  query.addEventListener('change', handler);
  return () => query.removeEventListener('change', handler);
};
