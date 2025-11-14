'use client';

import { ThemeProvider } from '@a24z/industry-theme';
import { AuthProvider } from '@/contexts/AuthContext';
import { GlobalThemeProvider, useGlobalTheme } from '@/contexts/ThemeContext';
import { MermaidInitializer } from './MermaidInitializer';
import { ReactNode } from 'react';

function ThemeProviderWrapper({ children }: { children: ReactNode }) {
  const { currentTheme } = useGlobalTheme();

  return (
    <ThemeProvider theme={currentTheme}>
      <MermaidInitializer />
      <AuthProvider>{children}</AuthProvider>
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
