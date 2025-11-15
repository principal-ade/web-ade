'use client';

import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import {
  terminalTheme,
  regalTheme,
  matrixTheme,
  matrixMinimalTheme,
  slateTheme,
  type Theme,
} from '@principal-ade/industry-theme';

export const availableThemes = [
  { name: 'Terminal', theme: terminalTheme },
  { name: 'Regal', theme: regalTheme },
  { name: 'Matrix', theme: matrixTheme },
  { name: 'Matrix Minimal', theme: matrixMinimalTheme },
  { name: 'Slate', theme: slateTheme },
] as const;

export type ThemeName = typeof availableThemes[number]['name'];

interface GlobalThemeContextValue {
  currentTheme: Theme;
  currentThemeName: ThemeName;
  setTheme: (name: ThemeName) => void;
  cycleTheme: () => void;
}

const GlobalThemeContext = createContext<GlobalThemeContextValue | undefined>(undefined);

export function GlobalThemeProvider({ children }: { children: ReactNode }) {
  const [themeIndex, setThemeIndex] = useState(0);

  // Load theme preference from localStorage on mount
  useEffect(() => {
    const savedThemeName = localStorage.getItem('selectedTheme');
    if (savedThemeName) {
      const index = availableThemes.findIndex(t => t.name === savedThemeName);
      if (index !== -1) {
        setThemeIndex(index);
      }
    }
  }, []);

  const currentTheme = availableThemes[themeIndex]!;

  const setTheme = useCallback((name: ThemeName) => {
    const index = availableThemes.findIndex(t => t.name === name);
    if (index !== -1) {
      setThemeIndex(index);
      localStorage.setItem('selectedTheme', name);
    }
  }, []);

  const cycleTheme = useCallback(() => {
    const nextIndex = (themeIndex + 1) % availableThemes.length;
    setThemeIndex(nextIndex);
    localStorage.setItem('selectedTheme', availableThemes[nextIndex]!.name);
  }, [themeIndex]);

  // Save theme preference whenever it changes
  useEffect(() => {
    localStorage.setItem('selectedTheme', currentTheme.name);
  }, [currentTheme.name]);

  return (
    <GlobalThemeContext.Provider
      value={{
        currentTheme: currentTheme.theme,
        currentThemeName: currentTheme.name,
        setTheme,
        cycleTheme,
      }}
    >
      {children}
    </GlobalThemeContext.Provider>
  );
}

export function useGlobalTheme() {
  const context = useContext(GlobalThemeContext);
  if (!context) {
    throw new Error('useGlobalTheme must be used within a GlobalThemeProvider');
  }
  return context;
}
