import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { TrailMarketingCardOG } from './TrailMarketingCardOG';

/**
 * Fallback social-preview card shown for non-public trails. Styled after the
 * home page hero. Fixed at 1200×628 so it previews 1:1 with the rendered PNG.
 */
const meta = {
  title: 'Trail/OG/TrailMarketingCardOG',
  component: TrailMarketingCardOG,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ width: 1200, height: 628, transform: 'scale(0.7)', transformOrigin: 'top left' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TrailMarketingCardOG>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CustomCopy: Story = {
  args: {
    headline: 'Code trails',
    tagline: 'Follow the path through any codebase',
  },
};
