import type { Meta, StoryObj } from '@storybook/react';
import { Providers } from '../src/components/Providers';
import { OptimizedWorkSection } from '../src/components/OptimizedWorkSection';

/**
 * Optimized Work Section
 *
 * Explains what kind of work needs to be optimized in the new AI paradigm.
 *
 * ## Collaboration & Alignment (Outer Work)
 * For outer agent work, focus on effective communication and ensuring AI agents
 * understand and align with your goals.
 *
 * ## Observability & Steering (Inner Work)
 * For inner agent work, maintain visibility into autonomous operations and
 * guide agents when they need course correction.
 */
const meta = {
  title: 'Sections/Optimized Work',
  component: OptimizedWorkSection,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'A section that explains the human capabilities needed to optimize work in an AI-first world.',
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
} satisfies Meta<typeof OptimizedWorkSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default view of the Optimized Work section
 */
export const Default: Story = {};

/**
 * The section as it would appear on the landing page
 */
export const LandingPageView: Story = {
  render: () => (
    <Providers>
      <div style={{ minHeight: '100vh' }}>
        <OptimizedWorkSection />
      </div>
    </Providers>
  ),
};
