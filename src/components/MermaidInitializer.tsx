'use client';

import { useEffect } from 'react';

/**
 * MermaidInitializer - Initializes Mermaid for diagram rendering
 *
 * This component initializes the mermaid library and exposes it to window.mermaid
 * which is required by the themed-markdown library for rendering mermaid diagrams.
 *
 * Based on the desktop-app implementation pattern.
 */
export function MermaidInitializer() {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Dynamically import mermaid only on the client side
      import('mermaid').then((mermaidModule) => {
        const mermaid = mermaidModule.default;

        // Initialize mermaid with configuration
        mermaid.initialize({
          startOnLoad: true,
          theme: 'default',
          securityLevel: 'loose',
        });

        // Expose mermaid to window for themed-markdown library
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).mermaid = mermaid;

        console.log('[MermaidInitializer] Mermaid initialized and exposed to window');
      }).catch((error) => {
        console.error('[MermaidInitializer] Failed to initialize mermaid:', error);
      });
    }
  }, []);

  // This is a utility component that doesn't render anything
  return null;
}
