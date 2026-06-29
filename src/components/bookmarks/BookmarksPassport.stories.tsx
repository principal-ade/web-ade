import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { ThemeProvider } from '@principal-ade/industry-theme';
import { BookmarksPassport } from './BookmarksPassport';
import type { BookmarkRepo } from './types';

const MOCK_REPOS: BookmarkRepo[] = [
  {
    full_name: 'facebook/react',
    name: 'react',
    owner: { login: 'facebook', avatar_url: 'https://avatars.githubusercontent.com/u/69631?v=4' },
    description: 'The library for web and native user interfaces.',
    stargazers_count: 228000,
    language: 'JavaScript',
  },
  {
    full_name: 'vercel/next.js',
    name: 'next.js',
    owner: { login: 'vercel', avatar_url: 'https://avatars.githubusercontent.com/u/14985020?v=4' },
    description: 'The React Framework.',
    stargazers_count: 125000,
    language: 'TypeScript',
  },
  {
    full_name: 'microsoft/vscode',
    name: 'vscode',
    owner: { login: 'microsoft', avatar_url: 'https://avatars.githubusercontent.com/u/6154722?v=4' },
    description: 'Visual Studio Code.',
    stargazers_count: 163000,
    language: 'TypeScript',
  },
  {
    full_name: 'torvalds/linux',
    name: 'linux',
    owner: { login: 'torvalds', avatar_url: 'https://avatars.githubusercontent.com/u/1024025?v=4' },
    description: 'Linux kernel source tree.',
    stargazers_count: 182000,
    language: 'C',
  },
  {
    full_name: 'tailwindlabs/tailwindcss',
    name: 'tailwindcss',
    owner: { login: 'tailwindlabs', avatar_url: 'https://avatars.githubusercontent.com/u/67109815?v=4' },
    description: 'A utility-first CSS framework.',
    stargazers_count: 82000,
    language: 'CSS',
  },
  {
    full_name: 'denoland/deno',
    name: 'deno',
    owner: { login: 'denoland', avatar_url: 'https://avatars.githubusercontent.com/u/42048915?v=4' },
    description: 'A modern runtime for JavaScript and TypeScript.',
    stargazers_count: 94000,
    language: 'Rust',
  },
  {
    full_name: 'rust-lang/rust',
    name: 'rust',
    owner: { login: 'rust-lang', avatar_url: 'https://avatars.githubusercontent.com/u/5430905?v=4' },
    description: 'Empowering everyone to build reliable and efficient software.',
    stargazers_count: 96000,
    language: 'Rust',
  },
  {
    full_name: 'sveltejs/svelte',
    name: 'svelte',
    owner: { login: 'sveltejs', avatar_url: 'https://avatars.githubusercontent.com/u/23617963?v=4' },
    description: 'Cybernetically enhanced web apps.',
    stargazers_count: 79000,
    language: 'JavaScript',
  },
];

const meta: Meta<typeof BookmarksPassport> = {
  title: 'Bookmarks/BookmarksPassport',
  component: BookmarksPassport,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <ThemeProvider>
        <Story />
      </ThemeProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof BookmarksPassport>;

/**
 * Empty passport — drag any repo from the "Recent repos" tray on the left
 * onto an empty slot to stamp it. Placed stamps can be dragged between slots
 * or removed with the × button on hover.
 */
export const Empty: Story = {
  args: {
    recentRepos: MOCK_REPOS,
  },
};

/**
 * A partly-collected passport showing pre-placed stamps (note the preserved
 * gaps) alongside repos still waiting in the tray.
 */
export const PartlyStamped: Story = {
  args: {
    recentRepos: MOCK_REPOS,
    initialSlots: [
      'facebook/react',
      null,
      'microsoft/vscode',
      null,
      'rust-lang/rust',
      'denoland/deno',
    ],
  },
};

/**
 * A single larger page (3×3) instead of a two-page spread.
 */
export const SinglePage: Story = {
  args: {
    recentRepos: MOCK_REPOS,
    pages: 1,
    cols: 3,
    rows: 3,
  },
};
