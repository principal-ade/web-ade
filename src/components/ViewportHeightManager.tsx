'use client';

import { useEffect } from 'react';

/**
 * ViewportHeightManager component
 *
 * Handles dynamic viewport height updates for mobile Safari.
 * Updates CSS custom property --vh when the viewport height changes,
 * preventing layout issues when Safari's UI bars appear/disappear.
 */
export function ViewportHeightManager() {
  useEffect(() => {
    // Function to update the vh custom property
    const updateVH = () => {
      // Use requestAnimationFrame to ensure we measure after Safari's animations
      requestAnimationFrame(() => {
        // Get the actual viewport height
        // Use visualViewport.height when available (iOS Safari) to get the visible area
        // excluding keyboard, toolbars, and safe areas. Fall back to window.innerHeight.
        const height = window.visualViewport?.height ?? window.innerHeight;
        const vh = height * 0.01;

        // Get current value to check if it actually changed
        const currentVh = document.documentElement.style.getPropertyValue('--vh');
        const newVh = `${vh}px`;

        // Only update if value changed
        if (currentVh !== newVh) {
          // Set the value in the --vh custom property
          document.documentElement.style.setProperty('--vh', newVh);

          // Force FULL repaint by triggering style recalculation
          // Reading offsetHeight forces reflow
          void document.documentElement.offsetHeight;

          // Trigger a second requestAnimationFrame to ensure the browser
          // fully repaints and recalculates all calc() expressions using --vh
          requestAnimationFrame(() => {
            // Force style recalc on body
            void document.body.offsetHeight;
          });
        }
      });
    };

    // Set initial value immediately
    updateVH();

    // Multiple updates to catch Safari's various adjustment phases
    // Extended timeouts to catch post-redirect viewport changes
    const timeouts = [
      setTimeout(updateVH, 0),
      setTimeout(updateVH, 50),
      setTimeout(updateVH, 100),
      setTimeout(updateVH, 250),
      setTimeout(updateVH, 500),
      setTimeout(updateVH, 750),
      setTimeout(updateVH, 1000),
      setTimeout(updateVH, 1500),
    ];

    // Update on resize (handles both width and height changes)
    window.addEventListener('resize', updateVH);

    // Update on orientation change (important for mobile)
    window.addEventListener('orientationchange', updateVH);

    // For iOS Safari, also listen to visualViewport changes
    // This catches the address bar appearing/disappearing
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateVH);
    }

    // Update when page becomes visible (after redirects, tab switches)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        updateVH();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Update on pageshow (fires after navigation/redirects)
    // This catches viewport changes after login redirects
    window.addEventListener('pageshow', updateVH);

    // Cleanup
    return () => {
      timeouts.forEach(clearTimeout);
      window.removeEventListener('resize', updateVH);
      window.removeEventListener('orientationchange', updateVH);
      window.removeEventListener('pageshow', updateVH);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateVH);
      }
    };
  }, []);

  // This component doesn't render anything
  return null;
}
