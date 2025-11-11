'use client';

import { ThemeProvider } from '@a24z/industry-theme';
import theme from '@a24z/industry-theme';
import { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}
