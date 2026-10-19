/**
 * Light / dark theme — the only place that knows how the theme is stored,
 * detected and applied. The theme is an attribute on <html>
 * (data-theme="light" | "dark") consumed by the tokens in styles/tokens.css.
 *
 * First visit: dark. After the user toggles, the saved choice always wins.
 *
 * index.html loads public/theme-init.js (a tiny copy of `resolveInitialTheme`)
 * as a blocking script before the app, so the first paint already uses the
 * right theme (no flash). Keep the storage key in sync with that script.
 */

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'skytop-theme';

const THEME_COLORS: Record<Theme, string> = { light: '#7422f0', dark: '#1b1826' };

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

/** Dark is the product default; the OS preference is intentionally not used. */
export const DEFAULT_THEME: Theme = 'dark';

/** Saved choice first, otherwise the dark default. */
export const resolveInitialTheme = (): Theme => readStoredTheme() ?? DEFAULT_THEME;

export const applyTheme = (theme: Theme): void => {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
};
