import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { ThemeProvider } from '@principal-ade/industry-theme';
import { Bookmark, Footprints } from 'lucide-react';
import {
  HomeTrailsTopicsView,
  type TrailListItem,
  type TopicListItem,
} from './HomeTrailsTopicsView';

const trails: TrailListItem[] = [
  { id: 't1', title: 'How auth refresh works', owner: 'you', repo: 'web-ade', markerCount: 8, updatedAt: '2026-06-28T10:00:00Z' },
  { id: 't2', title: 'The File City render pipeline', owner: 'principal-ai', repo: 'file-city', markerCount: 14, updatedAt: '2026-06-20T18:30:00Z' },
  { id: 't3', title: 'A trail that was deleted', owner: 'you', repo: 'gone', markerCount: 3, updatedAt: '2026-05-01T09:00:00Z', gone: true },
];

const topics: TopicListItem[] = [
  { id: 'p1', title: 'Cross-CLI change detection', trailCount: 3, updatedAt: '2026-06-27T12:00:00Z', descriptionPreview: 'Three CLIs solve filesystem-change detection three different ways.' },
  { id: 'p2', title: 'Onboarding tour', trailCount: 5, updatedAt: '2026-06-10T08:00:00Z' },
];

const StoryWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider>
    <div className="flex flex-col" style={{ width: 340, height: 620, border: '1px solid #ccc' }}>
      {children}
    </div>
  </ThemeProvider>
);

const meta: Meta<typeof HomeTrailsTopicsView> = {
  title: 'Home/HomeTrailsTopicsView',
  component: HomeTrailsTopicsView,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof HomeTrailsTopicsView>;

// The "Your Trails & Topics" configuration.
export const Library: Story = {
  render: () => (
    <StoryWrapper>
      <HomeTrailsTopicsView
        icon={<Footprints size={14} />}
        label="Your Trails & Topics"
        trails={trails.filter((t) => !t.gone)}
        topics={topics}
        emptyMessage="You haven't published any trails or topics yet."
        onBack={() => alert('back')}
      />
    </StoryWrapper>
  ),
};

// The "Bookmarks" configuration — includes a `gone` (deleted) trail.
export const Bookmarks: Story = {
  render: () => (
    <StoryWrapper>
      <HomeTrailsTopicsView
        icon={<Bookmark size={14} />}
        label="Bookmarks"
        trails={trails}
        topics={topics}
        emptyMessage="No bookmarks yet. Bookmark a trail or topic to find it here."
        onBack={() => alert('back')}
      />
    </StoryWrapper>
  ),
};

export const OnlyTrails: Story = {
  render: () => (
    <StoryWrapper>
      <HomeTrailsTopicsView
        icon={<Footprints size={14} />}
        label="Your Trails & Topics"
        trails={trails.filter((t) => !t.gone)}
        topics={[]}
        emptyMessage="Nothing yet."
        onBack={() => {}}
      />
    </StoryWrapper>
  ),
};

export const Loading: Story = {
  render: () => (
    <StoryWrapper>
      <HomeTrailsTopicsView
        icon={<Bookmark size={14} />}
        label="Bookmarks"
        trails={null}
        topics={null}
        emptyMessage="Nothing yet."
        onBack={() => {}}
      />
    </StoryWrapper>
  ),
};

export const Empty: Story = {
  render: () => (
    <StoryWrapper>
      <HomeTrailsTopicsView
        icon={<Bookmark size={14} />}
        label="Bookmarks"
        trails={[]}
        topics={[]}
        emptyMessage="No bookmarks yet. Bookmark a trail or topic to find it here."
        onBack={() => {}}
      />
    </StoryWrapper>
  ),
};
