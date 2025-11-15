import type { Meta, StoryObj } from '@storybook/react';
import { Providers } from '../src/components/Providers';
import { AgenticWorkSection } from '../src/components/AgenticWorkSection';

/**
 * Agentic Work Section
 *
 * Explains the concept of Outer and Inner Agentic Work - two complementary
 * modes of AI collaboration that transform how users work.
 *
 * ## Outer Agentic Work
 * AI assists your creative process in real-time, amplifying your capabilities
 * with intelligent suggestions and instant iterations.
 *
 * ## Inner Agentic Work
 * AI agents operate autonomously on structured tasks, handling complex workflows
 * while you focus on strategic decisions.
 */
const meta = {
  title: 'Sections/Agentic Work',
  component: AgenticWorkSection,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'A section that explains the dual modes of agentic work: autonomous task execution and real-time creative collaboration.',
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
} satisfies Meta<typeof AgenticWorkSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default view of the Agentic Work section
 */
export const Default: Story = {};

/**
 * The section as it would appear on the landing page
 */
export const LandingPageView: Story = {
  render: () => (
    <Providers>
      <div style={{ minHeight: '100vh' }}>
        <AgenticWorkSection />
      </div>
    </Providers>
  ),
};
