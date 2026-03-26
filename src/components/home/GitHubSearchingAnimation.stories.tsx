import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { ThemeProvider } from '@principal-ade/industry-theme';
import { GitHubSearchingAnimation } from './GitHubSearchingAnimation';

const StoryWrapper: React.FC<{ children: React.ReactNode; dark?: boolean }> = ({
  children,
  dark = false,
}) => (
  <ThemeProvider>
    <div
      style={{
        padding: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 300,
        background: dark ? '#1a1a2e' : '#f8f9fa',
        borderRadius: 12,
      }}
    >
      {children}
    </div>
  </ThemeProvider>
);

const meta: Meta<typeof GitHubSearchingAnimation> = {
  title: 'Home/GitHubSearchingAnimation',
  component: GitHubSearchingAnimation,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof GitHubSearchingAnimation>;

/**
 * Default animation with standard size and message
 */
export const Default: Story = {
  render: () => (
    <StoryWrapper>
      <GitHubSearchingAnimation />
    </StoryWrapper>
  ),
};

/**
 * Small version for inline use
 */
export const Small: Story = {
  render: () => (
    <StoryWrapper>
      <GitHubSearchingAnimation size={80} message="Looking..." />
    </StoryWrapper>
  ),
};

/**
 * Large version for full-page loading states
 */
export const Large: Story = {
  render: () => (
    <StoryWrapper>
      <GitHubSearchingAnimation size={180} message="Searching repositories..." />
    </StoryWrapper>
  ),
};

/**
 * No message variant
 */
export const NoMessage: Story = {
  render: () => (
    <StoryWrapper>
      <GitHubSearchingAnimation message="" />
    </StoryWrapper>
  ),
};

/**
 * Custom message
 */
export const CustomMessage: Story = {
  render: () => (
    <StoryWrapper>
      <GitHubSearchingAnimation message="Finding your repos..." />
    </StoryWrapper>
  ),
};

/**
 * Dark background to see the glow effects
 */
export const OnDarkBackground: Story = {
  render: () => (
    <StoryWrapper dark>
      <GitHubSearchingAnimation size={140} />
    </StoryWrapper>
  ),
};

/**
 * Multiple sizes comparison
 */
export const SizeComparison: Story = {
  render: () => (
    <ThemeProvider>
      <div
        style={{
          display: 'flex',
          gap: 48,
          alignItems: 'flex-end',
          padding: 40,
          background: '#f8f9fa',
          borderRadius: 12,
        }}
      >
        <GitHubSearchingAnimation size={60} message="Tiny" />
        <GitHubSearchingAnimation size={100} message="Medium" />
        <GitHubSearchingAnimation size={150} message="Large" />
      </div>
    </ThemeProvider>
  ),
};
