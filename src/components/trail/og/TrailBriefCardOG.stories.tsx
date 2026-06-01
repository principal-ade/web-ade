import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { TrailBriefCardOG } from './TrailBriefCardOG';

/**
 * Stories for the trail social-preview card. The card is fixed at 1200×628
 * (the Open Graph / Twitter `summary_large_image` size), so it renders here
 * exactly as it will in the `/api/og/trail/[id]` PNG. Use these to dial the
 * look against a screenshot of the live `TrailBriefCard`.
 */
const meta = {
  title: 'Trail/OG/TrailBriefCardOG',
  component: TrailBriefCardOG,
  parameters: { layout: 'centered' },
  // Frame at the true OG size so Storybook previews 1:1 with the rendered PNG.
  decorators: [
    (Story) => (
      <div style={{ width: 1200, height: 628, transform: 'scale(0.7)', transformOrigin: 'top left' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TrailBriefCardOG>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Investigation: Story = {
  args: {
    eyebrow: 'INVESTIGATION TRAIL',
    heading: 'How does a shared trail resolve from a bare /trail/:id link?',
    author: 'Fernando',
    createdLabel: '3d ago',
    // ~200 chars — mirrors the route's truncation so this previews 1:1.
    summary:
      'Traces the by-id pointer resolver: the /trail/:id page hits /api/trails/by-id/{id}, which reads the trails/_by-id/{id}.json pointer to find the owning {owner, repo}, then verifies repo access…',
    stopCount: 7,
    reviewers: ['Ada Lovelace', 'Grace Hopper'],
    noteAuthorCount: 3,
    visitorCount: 42,
    repoLabel: 'principal-ai/web-ade',
  },
};

export const Changelog: Story = {
  args: {
    eyebrow: 'CHANGELOG TRAIL',
    heading: 'Trails/Explored Files switch with file→trails overlay',
    author: 'Fernando',
    createdLabel: '2w ago',
    summary:
      'Adds a switch between the Trails and Explored Files views, with an overlay that maps explored files back onto the trails that touched them.',
    stopCount: 4,
    reviewers: ['Alan Turing'],
    visitorCount: 12,
    repoLabel: 'principal-ai/web-ade',
  },
};

export const InformativeVerified: Story = {
  args: {
    eyebrow: 'VERIFIED TRAIL',
    heading: 'Cross-repo type sharing for File City panels',
    author: 'Fernando',
    createdLabel: 'just now',
    summary:
      'File City payload, marker, snippet, and index-entry types come from @industry-theme/file-city-panel — the shared cross-repo source of truth also consumed by the electron app…',
    stopCount: 9,
    reviewers: ['Ada Lovelace', 'Grace Hopper', 'Alan Turing', 'Katherine Johnson', 'Margaret Hamilton', 'Barbara Liskov'],
    noteAuthorCount: 5,
    visitorCount: 128,
    repoLabel: 'principal-ai/web-ade',
  },
};

/** Long heading that must clamp; no summary; no reviewers. */
export const Minimal: Story = {
  args: {
    eyebrow: 'UNVERIFIED TRAIL',
    heading:
      'A deliberately very long trail heading that should wrap to two lines and then clamp without spilling past the header region of the card',
    author: 'Fernando',
    createdLabel: '5mo ago',
    stopCount: 2,
  },
};
