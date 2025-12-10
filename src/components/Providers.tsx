'use client';

import { ThemeProvider } from '@principal-ade/industry-theme';
import { AuthProvider } from '@/contexts/AuthContext';
import { ControlTowerProvider } from '@/contexts/ControlTowerContext';
import { GlobalThemeProvider, useGlobalTheme } from '@/contexts/ThemeContext';
import { MermaidInitializer } from './MermaidInitializer';
import { ReactNode } from 'react';

function ThemeProviderWrapper({ children }: { children: ReactNode }) {
  const { currentTheme } = useGlobalTheme();

  return (
    <ThemeProvider theme={currentTheme}>
      <MermaidInitializer />
      <AuthProvider>
        <ControlTowerProvider>{children}</ControlTowerProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <GlobalThemeProvider>
      <ThemeProviderWrapper>{children}</ThemeProviderWrapper>
    </GlobalThemeProvider>
  );
}
