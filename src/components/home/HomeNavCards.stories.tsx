import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { ThemeProvider } from '@principal-ade/industry-theme';
import { HomeNavCards } from './HomeNavCards';

// Rail-width wrapper so the cards render at roughly their real size in the pane.
const StoryWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider>
    <div style={{ width: 340 }}>{children}</div>
  </ThemeProvider>
);

const meta: Meta<typeof HomeNavCards> = {
  title: 'Home/HomeNavCards',
  component: HomeNavCards,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof HomeNavCards>;

export const Populated: Story = {
  render: () => (
    <StoryWrapper>
      <HomeNavCards
        counts={{ projects: 42, starred: 128, bookmarks: 9, library: 15, recent: 6 }}
        onOpenView={(key) => alert(`Open view: ${key}`)}
      />
    </StoryWrapper>
  ),
};

// Counts not loaded yet — cards render without the count chip.
export const NoCounts: Story = {
  render: () => (
    <StoryWrapper>
      <HomeNavCards onOpenView={(key) => alert(`Open view: ${key}`)} />
    </StoryWrapper>
  ),
};

export const WithActive: Story = {
  render: () => (
    <StoryWrapper>
      <HomeNavCards
        counts={{ projects: 42, starred: 128, bookmarks: 9, library: 15, recent: 6 }}
        activeView="starred"
        onOpenView={(key) => alert(`Open view: ${key}`)}
      />
    </StoryWrapper>
  ),
};

// A brand-new account: everything is zero.
export const EmptyAccount: Story = {
  render: () => (
    <StoryWrapper>
      <HomeNavCards
        counts={{ projects: 0, starred: 0, bookmarks: 0, library: 0, recent: 0 }}
        onOpenView={(key) => alert(`Open view: ${key}`)}
      />
    </StoryWrapper>
  ),
};
