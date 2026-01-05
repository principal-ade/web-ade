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
      // Get the actual viewport height
      const vh = window.innerHeight * 0.01;
      // Set the value in the --vh custom property
      document.documentElement.style.setProperty('--vh', `${vh}px`);

      // Force immediate reflow to apply the change
      // This helps prevent white space flash on Safari
      void document.documentElement.offsetHeight;
    };

    // Set initial value
    updateVH();

    // Also update after a brief delay to catch any late Safari adjustments
    const timeoutId = setTimeout(updateVH, 100);

    // Update on resize (handles both width and height changes)
    window.addEventListener('resize', updateVH);

    // Update on orientation change (important for mobile)
    window.addEventListener('orientationchange', updateVH);

    // For iOS Safari, also listen to visualViewport changes
    // This catches the address bar appearing/disappearing
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateVH);
    }

    // Cleanup
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', updateVH);
      window.removeEventListener('orientationchange', updateVH);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateVH);
      }
    };
  }, []);

  // This component doesn't render anything
  return null;
}
