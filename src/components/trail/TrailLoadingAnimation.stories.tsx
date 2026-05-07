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
        padding: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 360,
        background: dark ? '#0f1117' : '#f8f9fa',
        borderRadius: 12,
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
    layout: 'centered',
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

export const Compact: Story = {
  render: () => (
    <StoryWrapper>
      <TrailLoadingAnimation
        width={280}
        height={140}
        cols={8}
        rows={4}
        message="Loading…"
      />
    </StoryWrapper>
  ),
};

export const Wide: Story = {
  render: () => (
    <StoryWrapper dark>
      <TrailLoadingAnimation
        width={720}
        height={260}
        cols={18}
        rows={7}
      />
    </StoryWrapper>
  ),
};

export const DenseGrid: Story = {
  render: () => (
    <StoryWrapper dark>
      <TrailLoadingAnimation
        width={520}
        height={260}
        cols={20}
        rows={10}
      />
    </StoryWrapper>
  ),
};

export const ChunkyGrid: Story = {
  render: () => (
    <StoryWrapper dark>
      <TrailLoadingAnimation
        width={480}
        height={220}
        cols={8}
        rows={4}
      />
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
      <TrailLoadingAnimation
        width={640}
        height={260}
        cols={16}
        rows={7}
        maxTrails={10}
        cycleDuration={2200}
      />
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
