import type { Meta, StoryObj } from '@storybook/react';
import React, { useState } from 'react';
import { ThemeProvider } from '@principal-ade/industry-theme';
import { TrailLoadingAnimation } from './TrailLoadingAnimation';
import {
  BlockDropLoadingScreen,
  ownerAvatarUrl,
} from './BlockDropLoadingScreen';

/**
 * The owner/repo page loading screen. RepoTrailExplorerPage renders:
 *   <BlockDropLoadingScreen message={`Loading ${repo}`} />
 * which defaults to revealing the brand logo (`/icon-512x512.png`) — a
 * block-grid mark that assembles itself as the pieces drop. Passing
 * `imageSrc={ownerAvatarUrl(owner)}` swaps in the codebase avatar.
 *
 * These stories mount the real component in a fixed-height stage.
 */

/** Live GitHub owners for the avatar-override story. Sampled through a
 *  CORS canvas; a blocked fetch falls back to accent-colored pieces. */
const LIVE_OWNERS: ReadonlyArray<{ owner: string; repo: string }> = [
  { owner: 'vercel', repo: 'next.js' },
  { owner: 'facebook', repo: 'react' },
  { owner: 'microsoft', repo: 'vscode' },
  { owner: 'anthropics', repo: 'anthropic-sdk-typescript' },
];

/** Fixed-height stage — the real component fills its parent
 *  (`w-full h-full`); in the page that parent is a `fixed inset-0`
 *  overlay, here it's a bordered box. */
const Stage: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ width: '100%', height: 680, borderRadius: 12, overflow: 'hidden' }}>
    {children}
  </div>
);

const meta: Meta<typeof BlockDropLoadingScreen> = {
  title: 'Trail/Repo Loading Screen',
  component: BlockDropLoadingScreen,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof BlockDropLoadingScreen>;

/**
 * The shipped default: the brand logo dropping into place. Resolution
 * picker so the detail-vs-speed tradeoff is visible (the page ships the
 * 36×36 default).
 */
export const LogoDefault: Story = {
  render: () => {
    const RES_OPTIONS = [12, 20, 28, 36, 44];
    const [res, setRes] = useState(36);
    return (
      <ThemeProvider>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              padding: '12px 16px',
              background: '#0f1117',
            }}
          >
            <span
              style={{
                color: '#94a3b8',
                fontFamily: 'ui-monospace, monospace',
                fontSize: 12,
              }}
            >
              resolution
            </span>
            {RES_OPTIONS.map(r => {
              const active = r === res;
              return (
                <button
                  key={r}
                  onClick={() => setRes(r)}
                  style={{
                    padding: '6px 12px',
                    background: active ? '#22d3ee' : 'transparent',
                    color: active ? '#0a0f14' : '#94a3b8',
                    border: `1px solid ${active ? '#22d3ee' : '#2a3140'}`,
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontFamily: 'ui-monospace, monospace',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {r}×{r}
                </button>
              );
            })}
            <span
              style={{
                color: '#64748b',
                fontFamily: 'ui-monospace, monospace',
                fontSize: 11,
                marginLeft: 'auto',
              }}
            >
              {res * res} cells
            </span>
          </div>
          <Stage>
            <BlockDropLoadingScreen message="Loading web-ade" resolution={res} />
          </Stage>
        </div>
      </ThemeProvider>
    );
  },
};

/**
 * Override: sampling a live GitHub owner avatar instead of the logo, via
 * the exact helper the page exposes (`ownerAvatarUrl`). Pick an owner, or
 * paste any owner to preview its codebase avatar dropping into place.
 */
export const OwnerAvatarOverride: Story = {
  render: () => {
    const [owner, setOwner] = useState(LIVE_OWNERS[0]!.owner);
    const [repo, setRepo] = useState(LIVE_OWNERS[0]!.repo);
    const [pendingOwner, setPendingOwner] = useState(owner);
    return (
      <ThemeProvider>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              alignItems: 'center',
              padding: '12px 16px',
              background: '#0f1117',
            }}
          >
            {LIVE_OWNERS.map(a => {
              const active = a.owner === owner;
              return (
                <button
                  key={a.owner}
                  onClick={() => {
                    setOwner(a.owner);
                    setRepo(a.repo);
                    setPendingOwner(a.owner);
                  }}
                  style={{
                    padding: '6px 12px',
                    background: active ? '#22d3ee' : 'transparent',
                    color: active ? '#0a0f14' : '#94a3b8',
                    border: `1px solid ${active ? '#22d3ee' : '#2a3140'}`,
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontFamily: 'ui-monospace, monospace',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {a.owner}/{a.repo}
                </button>
              );
            })}
            <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
              <input
                value={pendingOwner}
                onChange={e => setPendingOwner(e.target.value)}
                placeholder="github owner"
                style={{
                  padding: '6px 10px',
                  background: '#1a1f2a',
                  color: '#f8fafc',
                  border: '1px solid #2a3140',
                  borderRadius: 6,
                  fontFamily: 'ui-monospace, monospace',
                  fontSize: 12,
                }}
              />
              <button
                onClick={() => {
                  setOwner(pendingOwner.trim());
                  setRepo('');
                }}
                style={{
                  padding: '6px 12px',
                  background: '#22d3ee',
                  color: '#0a0f14',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Load
              </button>
            </div>
          </div>
          <Stage>
            <BlockDropLoadingScreen
              message={`Loading ${repo || owner}`}
              imageSrc={ownerAvatarUrl(owner)}
            />
          </Stage>
        </div>
      </ThemeProvider>
    );
  },
};

/**
 * Head-to-head: the previous trail loader (left) vs the shipped
 * block-drop + logo loader (right).
 */
export const TrailVsBlockDrop: Story = {
  render: () => (
    <ThemeProvider>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
          padding: 16,
          background: '#0a0f14',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Label>Previous — trail</Label>
          <Stage>
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#0a0f14',
              }}
            >
              <div style={{ width: 'min(70vmin, 520px)', height: 'min(70vmin, 520px)' }}>
                <TrailLoadingAnimation message="Loading web-ade" />
              </div>
            </div>
          </Stage>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Label>Shipped — block drop + logo</Label>
          <Stage>
            <BlockDropLoadingScreen message="Loading web-ade" />
          </Stage>
        </div>
      </div>
    </ThemeProvider>
  ),
};

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      color: '#94a3b8',
      fontFamily: 'ui-monospace, monospace',
      fontSize: 12,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      textAlign: 'center',
    }}
  >
    {children}
  </div>
);
