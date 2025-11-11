'use client';

import { HeroSection } from './HeroSection';
import { HowItWorksSection } from './HowItWorksSection';
import { QuickStartSection } from './QuickStartSection';
import { FeaturesSection } from './FeaturesSection';
import { PanelShowcaseSection } from './PanelShowcaseSection';

/**
 * Complete landing page for Panel Extension System documentation
 *
 * This component combines all sections into a cohesive landing page
 * that explains the panel extension concept, architecture, and usage.
 */
export function PanelExtensionLanding() {
  return (
    <div className="min-h-screen">
      <HeroSection />
      <HowItWorksSection />
      <QuickStartSection />
      <FeaturesSection />
      <PanelShowcaseSection />
    </div>
  );
}
