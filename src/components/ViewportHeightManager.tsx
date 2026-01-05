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

    // Set initial value immediately
    updateVH();

    // Multiple updates to catch Safari's various adjustment phases
    const timeouts = [
      setTimeout(updateVH, 0),
      setTimeout(updateVH, 50),
      setTimeout(updateVH, 100),
      setTimeout(updateVH, 250),
      setTimeout(updateVH, 500),
    ];

    // Update on resize (handles both width and height changes)
    window.addEventListener('resize', updateVH);

    // Update on orientation change (important for mobile)
    window.addEventListener('orientationchange', updateVH);

    // For iOS Safari, also listen to visualViewport changes
    // This catches the address bar appearing/disappearing
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateVH);
      window.visualViewport.addEventListener('scroll', updateVH);
    }

    // Update on scroll (Safari sometimes adjusts on scroll)
    window.addEventListener('scroll', updateVH, { passive: true });

    // Update on focus (when user interacts with page)
    window.addEventListener('focus', updateVH);

    // Cleanup
    return () => {
      timeouts.forEach(clearTimeout);
      window.removeEventListener('resize', updateVH);
      window.removeEventListener('orientationchange', updateVH);
      window.removeEventListener('scroll', updateVH);
      window.removeEventListener('focus', updateVH);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateVH);
        window.visualViewport.removeEventListener('scroll', updateVH);
      }
    };
  }, []);

  // This component doesn't render anything
  return null;
}
