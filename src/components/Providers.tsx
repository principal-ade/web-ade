'use client';

import { ThemeProvider } from '@a24z/industry-theme';
import theme from '@a24z/industry-theme';
import { AuthProvider } from '@/contexts/AuthContext';
import { MermaidInitializer } from './MermaidInitializer';
import { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <MermaidInitializer />
      <AuthProvider>{children}</AuthProvider>
    </ThemeProvider>
  );
}
