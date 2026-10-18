import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  applyTheme,
  onSystemThemeChange,
  readStoredTheme,
  resolveInitialTheme,
  storeTheme,
} from './theme';
import type { Theme } from './theme';
import { ThemeContext } from './useTheme';

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  // index.html has already applied this theme before the first paint.
  const [theme, setTheme] = useState<Theme>(resolveInitialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Follow the operating system until the user picks a theme explicitly.
  useEffect(
    () =>
      onSystemThemeChange((next) => {
        if (!readStoredTheme()) setTheme(next);
      }),
    [],
  );

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark';
      storeTheme(next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
