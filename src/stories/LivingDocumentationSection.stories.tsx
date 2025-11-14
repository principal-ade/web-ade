import type { Meta, StoryObj } from '@storybook/react';
import { Providers } from '../components/Providers';
import { LivingDocumentationSection } from '../components/LivingDocumentationSection';

/**
 * Living Documentation Section
 *
 * Explains the concept of CodebaseViews and living documentation - how explicit links
 * between documentation and code files keep documentation accurate and provide AI agents
 * with precise context.
 *
 * ## Key Concepts
 * - **Always Accurate**: Validation ensures references point to real files
 * - **AI Precision**: AI agents know exactly which files to examine
 * - **Impact Analysis**: See which docs are affected by code changes
 * - **Automated Validation**: Get alerts when references break
 */
const meta = {
  title: 'Sections/Living Documentation',
  component: LivingDocumentationSection,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'A section that explains how CodebaseViews create validated links between documentation and code files.',
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
} satisfies Meta<typeof LivingDocumentationSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default view of the Living Documentation section
 */
export const Default: Story = {};

/**
 * The section as it would appear on the landing page
 */
export const LandingPageView: Story = {
  render: () => (
    <Providers>
      <div style={{ minHeight: '100vh' }}>
        <LivingDocumentationSection />
      </div>
    </Providers>
  ),
};
