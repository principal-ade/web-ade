import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { TrailBriefCardOG } from './TrailBriefCardOG';
import { projectTouchedCity } from './fileCityProjection';
import type { CityData } from '@principal-ai/file-city-builder';

/**
 * Sample File City (a slice of `tj/commander.js`, real treemap positions/sizes)
 * + a spread-out set of "touched" files in trail order. Run through the real
 * `projectTouchedCity` so the map previews 1:1 with the OG route, which builds
 * the city from the live GitHub tree.
 */
const SAMPLE_CITY: CityData = {
  buildings: [
    { path: 'examples/action-this.js', position: { x: 69, y: 2, z: 1183 }, dimensions: [69, 7, 80], type: 'file', fileExtension: '.js' },
    { path: 'index.js', position: { x: 1262, y: 2, z: 1249 }, dimensions: [119, 7, 69], type: 'file', fileExtension: '.js' },
    { path: 'typings/index.d.ts', position: { x: 1231, y: 2, z: 760 }, dimensions: [56, 40, 140], type: 'file', fileExtension: '.ts' },
    { path: 'lib/option.js', position: { x: 1440, y: 2, z: 589 }, dimensions: [145, 40, 54], type: 'file', fileExtension: '.js' },
    { path: 'lib/command.js', position: { x: 1479, y: 2, z: 374 }, dimensions: [71, 40, 113], type: 'file', fileExtension: '.js' },
  ],
  districts: [
    { path: 'examples', worldBounds: { minX: 0, maxX: 620, minZ: 1080, maxZ: 1520 }, fileCount: 12, type: 'directory' },
    { path: 'lib', worldBounds: { minX: 1340, maxX: 1520, minZ: 280, maxZ: 660 }, fileCount: 6, type: 'directory' },
    { path: 'typings', worldBounds: { minX: 1180, maxX: 1320, minZ: 660, maxZ: 870 }, fileCount: 2, type: 'directory' },
    { path: 'tests', worldBounds: { minX: 0, maxX: 700, minZ: 0, maxZ: 1060 }, fileCount: 20, type: 'directory' },
    { path: 'docs', worldBounds: { minX: 720, maxX: 1160, minZ: 0, maxZ: 600 }, fileCount: 8, type: 'directory' },
    {
      path: 'src',
      worldBounds: { minX: 720, maxX: 1160, minZ: 620, maxZ: 1520 },
      fileCount: 14,
      type: 'directory',
      children: [
        { path: 'src/utils', worldBounds: { minX: 760, maxX: 1120, minZ: 1000, maxZ: 1480 }, fileCount: 5, type: 'directory' },
      ],
    },
  ],
  bounds: { minX: 0, maxX: 1520, minZ: 0, maxZ: 1520 },
  metadata: { totalFiles: 5, totalDirectories: 0, analyzedAt: new Date(0), rootPath: '' },
};

const SAMPLE_FILE_MAP = projectTouchedCity(
  SAMPLE_CITY,
  ['examples/action-this.js', 'index.js', 'typings/index.d.ts', 'lib/option.js', 'lib/command.js'],
  500,
  500,
);

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

// Sample author (kicker) + repo (bottom tag). Repo matches SAMPLE_FILE_MAP
// (tj/commander.js); avatars use real GitHub logins so they load in Storybook.
const SAMPLE_AUTHOR = { name: 'Fernando', avatarUrl: 'https://github.com/sindresorhus.png?size=120' };
const SAMPLE_REPO = { name: 'commander.js', avatarUrl: 'https://github.com/tj.png?size=120' };

export const Investigation: Story = {
  args: {
    heading: 'How does a shared trail resolve from a bare /trail/:id link?',
    author: SAMPLE_AUTHOR,
    repo: SAMPLE_REPO,
    fileMap: SAMPLE_FILE_MAP,
  },
};

export const Changelog: Story = {
  args: {
    heading: 'Trails/Explored Files switch with file→trails overlay',
    author: SAMPLE_AUTHOR,
    repo: SAMPLE_REPO,
    fileMap: SAMPLE_FILE_MAP,
  },
};

export const InformativeVerified: Story = {
  args: {
    heading: 'Cross-repo type sharing for File City panels',
    author: SAMPLE_AUTHOR,
    repo: SAMPLE_REPO,
    fileMap: SAMPLE_FILE_MAP,
  },
};

/** Long heading that must clamp; no summary; no map. */
export const Minimal: Story = {
  args: {
    heading:
      'A deliberately very long trail heading that should wrap to two lines and then clamp without spilling past the header region of the card',
    author: SAMPLE_AUTHOR,
  },
};
