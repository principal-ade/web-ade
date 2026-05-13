import type { Meta, StoryObj } from '@storybook/react';
import React, { useState } from 'react';
import { ThemeProvider } from '@principal-ade/industry-theme';
import { FileCityTrailReveal } from './FileCityTrailReveal';

const StoryWrapper: React.FC<{
  children: React.ReactNode;
  dark?: boolean;
  width?: number;
}> = ({ children, dark = true, width = 560 }) => (
  <ThemeProvider>
    <div
      style={{
        padding: 40,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        minHeight: 360,
        background: dark ? '#0f1117' : '#f8f9fa',
        borderRadius: 12,
      }}
    >
      <div style={{ width }}>{children}</div>
    </div>
  </ThemeProvider>
);

const meta: Meta<typeof FileCityTrailReveal> = {
  title: 'Trail/FileCityTrailReveal',
  component: FileCityTrailReveal,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof FileCityTrailReveal>;

export const Default: Story = {
  render: () => {
    const [key, setKey] = useState(0);
    return (
      <StoryWrapper>
        <FileCityTrailReveal resetKey={key} />
        <button
          onClick={() => setKey(k => k + 1)}
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
          Replay
        </button>
      </StoryWrapper>
    );
  },
};

export const SlowReveal: Story = {
  render: () => {
    const [key, setKey] = useState(0);
    return (
      <StoryWrapper>
        <FileCityTrailReveal
          resetKey={key}
          travelMs={1100}
          dwellMs={1100}
          batchDelayMs={10000}
        />
        <button
          onClick={() => setKey(k => k + 1)}
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
          Replay
        </button>
      </StoryWrapper>
    );
  },
};

export const ManyTrails: Story = {
  render: () => {
    const [key, setKey] = useState(0);
    return (
      <StoryWrapper>
        <FileCityTrailReveal resetKey={key} trailCount={8} />
        <button
          onClick={() => setKey(k => k + 1)}
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
          Replay
        </button>
      </StoryWrapper>
    );
  },
};

export const DifferentSeed: Story = {
  render: () => {
    const [key, setKey] = useState(0);
    return (
      <StoryWrapper>
        <FileCityTrailReveal resetKey={key} seed={42} />
        <button
          onClick={() => setKey(k => k + 1)}
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
          Replay
        </button>
      </StoryWrapper>
    );
  },
};

export const NeighborsVsLoose: Story = {
  render: () => {
    const [key, setKey] = useState(0);
    return (
      <ThemeProvider>
        <div
          style={{
            padding: 40,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 20,
            background: '#0f1117',
            borderRadius: 12,
          }}
        >
          <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                width: 360,
              }}
            >
              <div style={{ color: '#94a3b8', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
                maxStep = 1 (neighbors)
              </div>
              <FileCityTrailReveal resetKey={key} maxStep={1} />
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                width: 360,
              }}
            >
              <div style={{ color: '#94a3b8', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
                maxStep = 3 (loose)
              </div>
              <FileCityTrailReveal resetKey={key} maxStep={3} />
            </div>
          </div>
          <button
            onClick={() => setKey(k => k + 1)}
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
            Replay both
          </button>
        </div>
      </ThemeProvider>
    );
  },
};

export const LargeJumps: Story = {
  render: () => {
    const [key, setKey] = useState(0);
    return (
      <StoryWrapper>
        <FileCityTrailReveal resetKey={key} maxStep={5} />
        <button
          onClick={() => setKey(k => k + 1)}
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
          Replay
        </button>
      </StoryWrapper>
    );
  },
};

export const FullyRevealed: Story = {
  render: () => (
    <StoryWrapper>
      <FileCityTrailReveal autoStart={false} />
    </StoryWrapper>
  ),
};
