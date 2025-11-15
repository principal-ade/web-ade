import type { Meta, StoryObj } from '@storybook/react';
import { Providers } from '../src/components/Providers';
import {
  HeroSection,
  HowItWorksSection,
  QuickStartSection,
  FeaturesSection,
  PanelShowcaseSection,
  PanelExtensionLanding,
} from '../src/components/PanelExtensionDocs';

/**
 * Panel Extension System Documentation
 *
 * A comprehensive landing page that explains the panel extension concept,
 * architecture, and provides code examples for developers.
 *
 * ## Sections:
 * 1. **Hero** - Introduction and value proposition
 * 2. **How It Works** - Architecture and system flow
 * 3. **Quick Start** - Code examples and setup
 * 4. **Features** - Key capabilities and benefits
 * 5. **Showcase** - Example panels and use cases
 */
const meta = {
  title: 'Documentation/Panel Extension System',
  component: PanelExtensionLanding,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Interactive documentation for the Panel Extension System, explaining how to build, distribute, and integrate third-party React components via NPM.',
      },
    },
  },
  decorators: [
    (Story) => (
      <Providers>
        <Story />
      </Providers>
    ),
  ],
} satisfies Meta<typeof PanelExtensionLanding>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Complete landing page with all sections
 */
export const FullLandingPage: Story = {};

/**
 * Hero section with value proposition
 */
export const Hero: Story = {
  render: () => (
    <Providers>
      <HeroSection />
    </Providers>
  ),
};

/**
 * How It Works section showing architecture
 */
export const HowItWorks: Story = {
  render: () => (
    <Providers>
      <HowItWorksSection />
    </Providers>
  ),
};

/**
 * Quick Start guide with code examples
 */
export const QuickStart: Story = {
  render: () => (
    <Providers>
      <QuickStartSection />
    </Providers>
  ),
};

/**
 * Features grid showing capabilities
 */
export const Features: Story = {
  render: () => (
    <Providers>
      <FeaturesSection />
    </Providers>
  ),
};

/**
 * Panel Showcase gallery
 */
export const PanelShowcase: Story = {
  render: () => (
    <Providers>
      <PanelShowcaseSection />
    </Providers>
  ),
};

/**
 * All sections stacked (for comparison)
 */
export const AllSections: Story = {
  render: () => (
    <Providers>
      <div>
        <HeroSection />
        <HowItWorksSection />
        <QuickStartSection />
        <FeaturesSection />
        <PanelShowcaseSection />
      </div>
    </Providers>
  ),
};
