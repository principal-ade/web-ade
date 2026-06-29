import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { ThemeProvider } from '@principal-ade/industry-theme';
import { BookmarksPanel } from './BookmarksPanel';
import type { BookmarkRepo } from './types';

const repo = (
  owner: string,
  name: string,
  stars: number,
  language: string,
  avatarId: number,
): BookmarkRepo => ({
  full_name: `${owner}/${name}`,
  name,
  owner: {
    login: owner,
    avatar_url: `https://avatars.githubusercontent.com/u/${avatarId}?v=4`,
  },
  stargazers_count: stars,
  language,
});

const CURRENT = repo('vercel', 'next.js', 125000, 'TypeScript', 14985020);

// Seed localStorage before the panel mounts so a story can show a pre-filled
// passport. Runs once via the useState initializer.
function Seeded({
  seed,
  children,
}: {
  seed: (BookmarkRepo | null)[];
  children: React.ReactNode;
}) {
  React.useState(() => {
    try {
      window.localStorage.setItem('repo-bookmarks', JSON.stringify(seed));
    } catch {
      /* noop */
    }
    return null;
  });
  return <>{children}</>;
}

function DrawerShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: 360,
        height: 720,
        boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
      }}
    >
      {children}
    </div>
  );
}

const meta: Meta<typeof BookmarksPanel> = {
  title: 'Bookmarks/BookmarksPanel',
  component: BookmarksPanel,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <ThemeProvider>
        <Story />
      </ThemeProvider>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof BookmarksPanel>;

/**
 * Empty passport — drag the "Currently viewing" repo into a slot, or click the
 * bookmark+ to drop it into the first empty one.
 */
export const Empty: Story = {
  render: () => (
    <Seeded seed={[]}>
      <DrawerShell>
        <BookmarksPanel
          currentRepo={CURRENT}
          onNavigate={(f) => console.log('navigate', f)}
          onClose={() => console.log('close')}
        />
      </DrawerShell>
    </Seeded>
  ),
};

/**
 * A partly-filled passport. The current repo here is already saved, so it shows
 * the "already saved" state instead of a draggable chip.
 */
export const Filled: Story = {
  render: () => (
    <Seeded
      seed={[
        {
          ...repo('facebook', 'react', 228000, 'JavaScript', 69631),
          note: 'Reference for the new reconciler work — see packages/react-reconciler.',
        },
        null,
        CURRENT,
        repo('rust-lang', 'rust', 96000, 'Rust', 5430905),
        null,
        repo('tailwindlabs', 'tailwindcss', 82000, 'CSS', 67109815),
      ]}
    >
      <DrawerShell>
        <BookmarksPanel
          currentRepo={CURRENT}
          onNavigate={(f) => console.log('navigate', f)}
          onClose={() => console.log('close')}
        />
      </DrawerShell>
    </Seeded>
  ),
};

/**
 * No current repo (e.g. opened from a non-repo context) — just the saved column.
 */
export const NoCurrentRepo: Story = {
  render: () => (
    <Seeded seed={[repo('denoland', 'deno', 94000, 'Rust', 42048915)]}>
      <DrawerShell>
        <BookmarksPanel
          currentRepo={null}
          onNavigate={(f) => console.log('navigate', f)}
          onClose={() => console.log('close')}
        />
      </DrawerShell>
    </Seeded>
  ),
};
