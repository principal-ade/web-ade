import type { Meta, StoryObj } from '@storybook/react';
import { Providers } from '../src/components/Providers';
import { PrincipalADEWebSection } from '../src/components/PrincipalADEWebSection';

/**
 * Principal ADE Web Section
 *
 * The hero section of the landing page that introduces the Git-Based Agentic Workspace.
 *
 * ## Features
 * - Interactive panel layout demonstration
 * - Panel controls for toggling, switching, and configuring panels
 * - Edit mode for rearranging panels
 * - Responsive design with gradient background
 * - CTA button to try the editor
 */
const meta = {
  title: 'Sections/Principal ADE Web',
  component: PrincipalADEWebSection,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'The hero section showcasing the interactive panel-based workspace with live demonstrations of panel controls and layout customization.',
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
} satisfies Meta<typeof PrincipalADEWebSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default view of the Principal ADE Web section
 */
export const Default: Story = {};

/**
 * The section as it would appear on the landing page
 */
export const LandingPageView: Story = {
  render: () => (
    <Providers>
      <div style={{ minHeight: '100vh' }}>
        <PrincipalADEWebSection />
      </div>
    </Providers>
  ),
};

/**
 * Mobile viewport preview
 */
export const MobileView: Story = {
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
};

/**
 * Tablet viewport preview
 */
export const TabletView: Story = {
  parameters: {
    viewport: {
      defaultViewport: 'tablet',
    },
  },
};
