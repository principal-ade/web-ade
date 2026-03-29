'use client';

import { createContext, useContext, useState, useCallback, ReactNode, useEffect, useMemo } from 'react';
import {
  terminalTheme,
  regalTheme,
  matrixTheme,
  matrixMinimalTheme,
  slateTheme,
  slateGoldTheme,
  enterpriseTheme,
  neuralPulseTheme,
  humanCentricTheme,
  landingPageTheme,
  landingPageLightTheme,
  overrideColors,
  type Theme,
} from '@principal-ade/industry-theme';

export const availableThemes = [
  { name: 'Slate Gold', theme: slateGoldTheme },
  { name: 'Landing Page', theme: landingPageTheme },
  { name: 'Landing Page Light', theme: landingPageLightTheme },
  { name: 'Terminal', theme: terminalTheme },
  { name: 'Regal', theme: regalTheme },
  { name: 'Matrix', theme: matrixTheme },
  { name: 'Matrix Minimal', theme: matrixMinimalTheme },
  { name: 'Slate', theme: slateTheme },
  { name: 'Enterprise', theme: enterpriseTheme },
  { name: 'Neural Pulse', theme: neuralPulseTheme },
  { name: 'Human-Centric', theme: humanCentricTheme },
] as const;

// Themes to skip when cycling (light themes that might surprise users)
const cycleSkipThemes = new Set(['Landing Page Light']);

export type ThemeName = typeof availableThemes[number]['name'];

type ColorOverrides = Partial<Theme['colors']>;

interface GlobalThemeContextValue {
  currentTheme: Theme;
  baseTheme: Theme;
  currentThemeName: ThemeName;
  colorOverrides: ColorOverrides;
  setTheme: (name: ThemeName) => void;
  cycleTheme: () => void;
  setColor: (colorKey: keyof Theme['colors'], value: string) => void;
  resetColor: (colorKey: keyof Theme['colors']) => void;
  resetAllColors: () => void;
}

const GlobalThemeContext = createContext<GlobalThemeContextValue | undefined>(undefined);

const COLOR_OVERRIDES_KEY = 'themeColorOverrides';

export function GlobalThemeProvider({ children }: { children: ReactNode }) {
  const [themeIndex, setThemeIndex] = useState(0);
  const [colorOverrides, setColorOverrides] = useState<ColorOverrides>({});

  // Load theme preference and color overrides from localStorage on mount
  useEffect(() => {
    const savedThemeName = localStorage.getItem('selectedTheme');
    if (savedThemeName) {
      const index = availableThemes.findIndex(t => t.name === savedThemeName);
      if (index !== -1) {
        setThemeIndex(index);
      }
    }

    const savedOverrides = localStorage.getItem(COLOR_OVERRIDES_KEY);
    if (savedOverrides) {
      try {
        setColorOverrides(JSON.parse(savedOverrides));
      } catch {
        // Invalid JSON, ignore
      }
    }
  }, []);

  const baseTheme = availableThemes[themeIndex]!.theme;

  // Compute the final theme with color overrides applied
  const currentTheme = useMemo(() => {
    if (Object.keys(colorOverrides).length === 0) {
      return baseTheme;
    }
    return overrideColors(baseTheme, colorOverrides);
  }, [baseTheme, colorOverrides]);

  const setTheme = useCallback((name: ThemeName) => {
    const index = availableThemes.findIndex(t => t.name === name);
    if (index !== -1) {
      setThemeIndex(index);
      localStorage.setItem('selectedTheme', name);
    }
  }, []);

  const cycleTheme = useCallback(() => {
    let nextIndex = (themeIndex + 1) % availableThemes.length;
    // Skip themes that shouldn't be in the cycle
    while (cycleSkipThemes.has(availableThemes[nextIndex]!.name)) {
      nextIndex = (nextIndex + 1) % availableThemes.length;
    }
    setThemeIndex(nextIndex);
    localStorage.setItem('selectedTheme', availableThemes[nextIndex]!.name);
  }, [themeIndex]);

  const setColor = useCallback((colorKey: keyof Theme['colors'], value: string) => {
    setColorOverrides(prev => {
      const newOverrides = { ...prev, [colorKey]: value };
      localStorage.setItem(COLOR_OVERRIDES_KEY, JSON.stringify(newOverrides));
      return newOverrides;
    });
  }, []);

  const resetColor = useCallback((colorKey: keyof Theme['colors']) => {
    setColorOverrides(prev => {
      const newOverrides = { ...prev };
      delete newOverrides[colorKey];
      localStorage.setItem(COLOR_OVERRIDES_KEY, JSON.stringify(newOverrides));
      return newOverrides;
    });
  }, []);

  const resetAllColors = useCallback(() => {
    setColorOverrides({});
    localStorage.removeItem(COLOR_OVERRIDES_KEY);
  }, []);

  // Save theme preference whenever it changes
  useEffect(() => {
    localStorage.setItem('selectedTheme', availableThemes[themeIndex]!.name);
  }, [themeIndex]);

  return (
    <GlobalThemeContext.Provider
      value={{
        currentTheme,
        baseTheme,
        currentThemeName: availableThemes[themeIndex]!.name,
        colorOverrides,
        setTheme,
        cycleTheme,
        setColor,
        resetColor,
        resetAllColors,
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
