import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { ThemeProvider, useTheme } from '@principal-ade/industry-theme';
import { Bookmark } from 'lucide-react';
import { BookmarksDrawer } from './BookmarksDrawer';
import type { BookmarkRepo } from './types';

const CURRENT: BookmarkRepo = {
  full_name: 'vercel/next.js',
  name: 'next.js',
  owner: {
    login: 'vercel',
    avatar_url: 'https://avatars.githubusercontent.com/u/14985020?v=4',
  },
  stargazers_count: 125000,
  language: 'TypeScript',
};

function seed() {
  try {
    window.localStorage.setItem(
      'repo-bookmarks',
      JSON.stringify([
        {
          full_name: 'facebook/react',
          name: 'react',
          owner: {
            login: 'facebook',
            avatar_url: 'https://avatars.githubusercontent.com/u/69631?v=4',
          },
          stargazers_count: 228000,
          language: 'JavaScript',
        },
        null,
        {
          full_name: 'rust-lang/rust',
          name: 'rust',
          owner: {
            login: 'rust-lang',
            avatar_url: 'https://avatars.githubusercontent.com/u/5430905?v=4',
          },
          stargazers_count: 96000,
          language: 'Rust',
        },
      ]),
    );
  } catch {
    /* noop */
  }
}

// A faux repo page with a header bookmark button, so the docked slide-in +
// backdrop can be seen in context.
function Demo({ startOpen }: { startOpen: boolean }) {
  const { theme } = useTheme();
  React.useState(() => {
    seed();
    return null;
  });
  const [open, setOpen] = React.useState(startOpen);
  return (
    <div style={{ height: '100vh', background: theme.colors.background }}>
      <header
        className="flex items-center justify-end gap-2"
        style={{
          height: 56,
          padding: '0 16px',
          borderBottom: `1px solid ${theme.colors.border}`,
        }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-pressed={open}
          className="flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80"
          style={{
            color: open ? theme.colors.primary : theme.colors.text,
            background: open
              ? `color-mix(in srgb, ${theme.colors.primary} 15%, transparent)`
              : 'transparent',
          }}
          title="Bookmarks"
        >
          <Bookmark className="w-5 h-5" />
        </button>
      </header>
      <div style={{ padding: 24, color: theme.colors.textMuted }}>
        Repo page content…
      </div>
      <BookmarksDrawer
        open={open}
        onClose={() => setOpen(false)}
        currentRepo={CURRENT}
        onNavigate={(f) => console.log('navigate', f)}
      />
    </div>
  );
}

const meta: Meta<typeof Demo> = {
  title: 'Bookmarks/BookmarksDrawer',
  component: Demo,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <ThemeProvider>
        <Story />
      </ThemeProvider>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof Demo>;

export const Open: Story = { args: { startOpen: true } };
export const Closed: Story = { args: { startOpen: false } };
