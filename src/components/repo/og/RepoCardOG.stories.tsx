import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { RepoCardOG } from './RepoCardOG';
import { projectFullCity } from '../../trail/og/fileCityProjection';
import type { CityData } from '@principal-ai/file-city-builder';

/**
 * A denser synthetic City than the trail stories use — the repo card draws
 * *every* building, so we want a populated, multi-directory codebase to show
 * the full-city coloring. Buildings are laid out as a grid inside each district
 * with varied extensions so `getFileColor` produces a realistic spread. Run
 * through the real `projectFullCity` so the map previews 1:1 with the OG route,
 * which builds the city from the live GitHub tree.
 */
const EXTENSIONS = ['.ts', '.tsx', '.js', '.json', '.css', '.md', '.py', '.go', '.rs', '.yml'];

const DISTRICT_SPECS = [
  { path: 'src', x: 40, z: 40, cols: 6, rows: 7 },
  { path: 'src/components', x: 40, z: 700, cols: 5, rows: 5 },
  { path: 'lib', x: 700, z: 40, cols: 4, rows: 6 },
  { path: 'tests', x: 700, z: 600, cols: 5, rows: 4 },
  { path: 'docs', x: 1120, z: 40, cols: 3, rows: 4 },
  { path: 'examples', x: 1120, z: 520, cols: 3, rows: 3 },
];

const CELL = 96;
const GAP = 22;

function generateCity(): CityData {
  const buildings: CityData['buildings'] = [];
  const districts: CityData['districts'] = [];
  let seed = 0;

  for (const spec of DISTRICT_SPECS) {
    const w = spec.cols * CELL;
    const h = spec.rows * CELL;
    districts.push({
      path: spec.path,
      worldBounds: { minX: spec.x, maxX: spec.x + w, minZ: spec.z, maxZ: spec.z + h },
      fileCount: spec.cols * spec.rows,
      type: 'directory',
    });
    for (let r = 0; r < spec.rows; r++) {
      for (let c = 0; c < spec.cols; c++) {
        seed += 1;
        // Skip ~12% of cells so the city isn't a perfect grid.
        if (seed % 8 === 3) continue;
        const ext = EXTENSIONS[seed % EXTENSIONS.length]!;
        const size = CELL - GAP - (seed % 3) * 8;
        buildings.push({
          path: `${spec.path}/file-${r}-${c}${ext}`,
          position: {
            x: spec.x + c * CELL + CELL / 2,
            y: 2,
            z: spec.z + r * CELL + CELL / 2,
          },
          dimensions: [size, 8 + (seed % 5) * 6, size],
          type: 'file',
          fileExtension: ext,
        });
      }
    }
  }

  return {
    buildings,
    districts,
    bounds: { minX: 0, maxX: 1480, minZ: 0, maxZ: 1100 },
    metadata: { totalFiles: buildings.length, totalDirectories: districts.length, analyzedAt: new Date(0), rootPath: '' },
  };
}

const SAMPLE_CITY = generateCity();
const SAMPLE_FILE_MAP = projectFullCity(SAMPLE_CITY, 548, 548);

/**
 * Stories for the repo social-preview card. Fixed at 1200×628 (the Open Graph /
 * Twitter `summary_large_image` size), so it renders here exactly as it will in
 * the rendered PNG. Avatars use real GitHub logins so they load in Storybook.
 */
const meta = {
  title: 'Repo/OG/RepoCardOG',
  component: RepoCardOG,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ width: 1200, height: 628, transform: 'scale(0.7)', transformOrigin: 'top left' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    fileMap: SAMPLE_FILE_MAP,
  },
} satisfies Meta<typeof RepoCardOG>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TypeScriptRepo: Story = {
  args: {
    owner: 'facebook',
    repo: 'react',
    ownerAvatarUrl: 'https://github.com/facebook.png?size=120',
    description: 'The library for web and native user interfaces.',
    stars: 228000,
    language: 'TypeScript',
    files: 2400,
  },
};

export const RustRepo: Story = {
  args: {
    owner: 'rust-lang',
    repo: 'rust',
    ownerAvatarUrl: 'https://github.com/rust-lang.png?size=120',
    description: 'Empowering everyone to build reliable and efficient software.',
    stars: 98000,
    language: 'Rust',
    files: 8800,
  },
};

/** No description, no avatar — leans entirely on the colored city + name. */
export const Minimal: Story = {
  args: {
    owner: 'octocat',
    repo: 'hello-world',
    stars: 12,
    language: 'JavaScript',
    files: 3,
  },
};

/** Long repo name + description that must clamp. */
export const LongName: Story = {
  args: {
    owner: 'some-organization',
    repo: 'a-very-long-repository-name-here',
    ownerAvatarUrl: 'https://github.com/github.png?size=120',
    description:
      'A deliberately long description that should clamp to a couple of lines without spilling past the identity column of the card layout.',
    stars: 1543,
    language: 'Go',
    files: 412,
  },
};
