import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { ThemeProvider } from '@principal-ade/industry-theme';
import { TrailLoadingAnimation } from './TrailLoadingAnimation';

const StoryWrapper: React.FC<{
  children: React.ReactNode;
  dark?: boolean;
}> = ({ children, dark = false }) => (
  <ThemeProvider>
    <div
      style={{
        width: '100vw',
        height: '100vh',
        padding: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: dark ? '#0f1117' : '#f8f9fa',
        boxSizing: 'border-box',
      }}
    >
      {children}
    </div>
  </ThemeProvider>
);

const meta: Meta<typeof TrailLoadingAnimation> = {
  title: 'Trail/TrailLoadingAnimation',
  component: TrailLoadingAnimation,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof TrailLoadingAnimation>;

export const Default: Story = {
  render: () => (
    <StoryWrapper>
      <TrailLoadingAnimation />
    </StoryWrapper>
  ),
};

export const Dark: Story = {
  render: () => (
    <StoryWrapper dark>
      <TrailLoadingAnimation />
    </StoryWrapper>
  ),
};

export const CustomMessage: Story = {
  render: () => (
    <StoryWrapper>
      <TrailLoadingAnimation message="Loading…" />
    </StoryWrapper>
  ),
};

export const SlowCycle: Story = {
  render: () => (
    <StoryWrapper dark>
      <TrailLoadingAnimation cycleDuration={4500} />
    </StoryWrapper>
  ),
};

export const ManyTrails: Story = {
  render: () => (
    <StoryWrapper dark>
      <TrailLoadingAnimation maxTrails={10} cycleDuration={2200} />
    </StoryWrapper>
  ),
};

export const FewTrails: Story = {
  render: () => (
    <StoryWrapper dark>
      <TrailLoadingAnimation maxTrails={3} />
    </StoryWrapper>
  ),
};

export const NoMessage: Story = {
  render: () => (
    <StoryWrapper>
      <TrailLoadingAnimation message="" />
    </StoryWrapper>
  ),
};
