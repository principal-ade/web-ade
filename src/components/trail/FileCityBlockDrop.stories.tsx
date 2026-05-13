import type { Meta, StoryObj } from '@storybook/react';
import React, { useState } from 'react';
import { ThemeProvider } from '@principal-ade/industry-theme';
import { FileCityBlockDrop } from './FileCityBlockDrop';

const StoryWrapper: React.FC<{
  children: React.ReactNode;
  width?: number;
}> = ({ children, width = 560 }) => (
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
        background: '#0f1117',
        borderRadius: 12,
      }}
    >
      <div style={{ width }}>{children}</div>
    </div>
  </ThemeProvider>
);

const ReplayButton: React.FC<{ onClick: () => void; label?: string }> = ({
  onClick,
  label = 'Replay',
}) => (
  <button
    onClick={onClick}
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
    {label}
  </button>
);

const meta: Meta<typeof FileCityBlockDrop> = {
  title: 'Trail/FileCityBlockDrop',
  component: FileCityBlockDrop,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof FileCityBlockDrop>;

export const Default: Story = {
  render: () => {
    const [key, setKey] = useState(0);
    return (
      <StoryWrapper>
        <FileCityBlockDrop resetKey={key} />
        <ReplayButton onClick={() => setKey(k => k + 1)} />
      </StoryWrapper>
    );
  },
};

export const Snappy: Story = {
  render: () => {
    const [key, setKey] = useState(0);
    return (
      <StoryWrapper>
        <FileCityBlockDrop
          resetKey={key}
          pieceDelayMs={110}
          dropDurationMs={380}
        />
        <ReplayButton onClick={() => setKey(k => k + 1)} />
      </StoryWrapper>
    );
  },
};

export const ClearPause: Story = {
  render: () => {
    const [key, setKey] = useState(0);
    return (
      <StoryWrapper>
        <FileCityBlockDrop
          resetKey={key}
          cols={8}
          rows={8}
          pieceDelayMs={650}
          dropDurationMs={500}
          dropDistance={340}
        />
        <ReplayButton onClick={() => setKey(k => k + 1)} />
      </StoryWrapper>
    );
  },
};

export const Scatter: Story = {
  render: () => {
    const [key, setKey] = useState(0);
    return (
      <StoryWrapper>
        <FileCityBlockDrop
          resetKey={key}
          groupingMode="scatter"
          scatterGroupSize={4}
        />
        <ReplayButton onClick={() => setKey(k => k + 1)} />
      </StoryWrapper>
    );
  },
};

export const ScatterLargeGroups: Story = {
  render: () => {
    const [key, setKey] = useState(0);
    return (
      <StoryWrapper>
        <FileCityBlockDrop
          resetKey={key}
          groupingMode="scatter"
          scatterGroupSize={8}
        />
        <ReplayButton onClick={() => setKey(k => k + 1)} />
      </StoryWrapper>
    );
  },
};

export const TetrominoVsScatter: Story = {
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
              <div
                style={{
                  color: '#94a3b8',
                  fontFamily: 'ui-monospace, monospace',
                  fontSize: 12,
                }}
              >
                tetromino (adjacent)
              </div>
              <FileCityBlockDrop resetKey={key} groupingMode="tetromino" />
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
              <div
                style={{
                  color: '#94a3b8',
                  fontFamily: 'ui-monospace, monospace',
                  fontSize: 12,
                }}
              >
                scatter (group size 4)
              </div>
              <FileCityBlockDrop
                resetKey={key}
                groupingMode="scatter"
                scatterGroupSize={4}
              />
            </div>
          </div>
          <ReplayButton onClick={() => setKey(k => k + 1)} label="Replay both" />
        </div>
      </ThemeProvider>
    );
  },
};

export const ImageBrain: Story = {
  render: () => {
    const [key, setKey] = useState(0);
    return (
      <StoryWrapper>
        <FileCityBlockDrop resetKey={key} image="brain" />
        <ReplayButton onClick={() => setKey(k => k + 1)} />
      </StoryWrapper>
    );
  },
};

export const ImageSkyline: Story = {
  render: () => {
    const [key, setKey] = useState(0);
    return (
      <StoryWrapper>
        <FileCityBlockDrop resetKey={key} image="skyline" />
        <ReplayButton onClick={() => setKey(k => k + 1)} />
      </StoryWrapper>
    );
  },
};

export const ImageDistricts: Story = {
  render: () => {
    const [key, setKey] = useState(0);
    return (
      <StoryWrapper>
        <FileCityBlockDrop resetKey={key} image="districts" />
        <ReplayButton onClick={() => setKey(k => k + 1)} />
      </StoryWrapper>
    );
  },
};

export const ImageGraph: Story = {
  render: () => {
    const [key, setKey] = useState(0);
    return (
      <StoryWrapper>
        <FileCityBlockDrop resetKey={key} image="graph" />
        <ReplayButton onClick={() => setKey(k => k + 1)} />
      </StoryWrapper>
    );
  },
};

export const ImageGallery: Story = {
  render: () => {
    const [key, setKey] = useState(0);
    const cell = (label: string, image: 'brain' | 'skyline' | 'districts' | 'graph') => (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          width: 340,
        }}
      >
        <div
          style={{
            color: '#94a3b8',
            fontFamily: 'ui-monospace, monospace',
            fontSize: 12,
            letterSpacing: '0.1em',
          }}
        >
          {label}
        </div>
        <FileCityBlockDrop resetKey={key} image={image} />
      </div>
    );
    return (
      <ThemeProvider>
        <div
          style={{
            padding: 40,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 24,
            background: '#0f1117',
            borderRadius: 12,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
            {cell('BRAIN', 'brain')}
            {cell('SKYLINE', 'skyline')}
            {cell('DISTRICTS', 'districts')}
            {cell('GRAPH', 'graph')}
          </div>
          <ReplayButton onClick={() => setKey(k => k + 1)} label="Replay all" />
        </div>
      </ThemeProvider>
    );
  },
};

const HEART_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <rect width="24" height="24" fill="#0a0f14"/>
  <path d="M12 21s-7-4.35-10-9.5C0.5 7.5 2 4 6 4c2.5 0 4 1.5 6 3 2-1.5 3.5-3 6-3 4 0 5.5 3.5 4 7.5C19 16.65 12 21 12 21z" fill="#f43f5e"/>
</svg>`;
const HEART_URL = `data:image/svg+xml;base64,${typeof btoa !== 'undefined' ? btoa(HEART_SVG) : ''}`;

const ROCKET_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <rect width="24" height="24" fill="#0a0f14"/>
  <path d="M12 2C9 5 7 9 7 13l-2 1v3l4-1v3l3 2 3-2v-3l4 1v-3l-2-1c0-4-2-8-5-11z" fill="#22d3ee"/>
  <circle cx="12" cy="10" r="2" fill="#facc15"/>
  <path d="M9 18l-2 4 3-1z M15 18l2 4-3-1z" fill="#fb923c"/>
</svg>`;
const ROCKET_URL = `data:image/svg+xml;base64,${typeof btoa !== 'undefined' ? btoa(ROCKET_SVG) : ''}`;

const ARROW_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <rect width="24" height="24" fill="#0a0f14"/>
  <path d="M3 12h14m0 0l-5-5m5 5l-5 5" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>`;
const ARROW_URL = `data:image/svg+xml;base64,${typeof btoa !== 'undefined' ? btoa(ARROW_SVG) : ''}`;

export const ImageFromUrlHeart: Story = {
  render: () => {
    const [key, setKey] = useState(0);
    return (
      <StoryWrapper>
        <FileCityBlockDrop resetKey={key} imageSrc={HEART_URL} />
        <ReplayButton onClick={() => setKey(k => k + 1)} />
      </StoryWrapper>
    );
  },
};

export const ImageFromUrlRocket: Story = {
  render: () => {
    const [key, setKey] = useState(0);
    return (
      <StoryWrapper>
        <FileCityBlockDrop resetKey={key} imageSrc={ROCKET_URL} />
        <ReplayButton onClick={() => setKey(k => k + 1)} />
      </StoryWrapper>
    );
  },
};

export const ImageFromUrlArrow: Story = {
  render: () => {
    const [key, setKey] = useState(0);
    return (
      <StoryWrapper>
        <FileCityBlockDrop resetKey={key} imageSrc={ARROW_URL} />
        <ReplayButton onClick={() => setKey(k => k + 1)} />
      </StoryWrapper>
    );
  },
};

export const ImageFromUrlCustom: Story = {
  render: () => {
    const [key, setKey] = useState(0);
    const [url, setUrl] = useState(HEART_URL);
    const [pending, setPending] = useState(HEART_URL);
    return (
      <ThemeProvider>
        <div
          style={{
            padding: 40,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
            background: '#0f1117',
            borderRadius: 12,
            width: 640,
          }}
        >
          <div style={{ display: 'flex', gap: 8, width: '100%' }}>
            <input
              value={pending}
              onChange={e => setPending(e.target.value)}
              placeholder="Paste an image URL or data URL"
              style={{
                flex: 1,
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
                setUrl(pending);
                setKey(k => k + 1);
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
          <div style={{ width: 560 }}>
            <FileCityBlockDrop resetKey={key} imageSrc={url} />
          </div>
          <ReplayButton onClick={() => setKey(k => k + 1)} />
        </div>
      </ThemeProvider>
    );
  },
};

export const KnowYourCodebase: Story = {
  render: () => {
    const [percent, setPercent] = useState(0);
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
            width: 640,
          }}
        >
          <div
            style={{
              color: '#f8fafc',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 18,
              fontWeight: 600,
              letterSpacing: '0.04em',
            }}
          >
            How well do you know your codebase?
          </div>
          <div style={{ width: 560 }}>
            <FileCityBlockDrop image="districts" revealPercent={percent / 100} />
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              width: '100%',
              maxWidth: 560,
            }}
          >
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={percent}
              onChange={e => setPercent(Number(e.target.value))}
              style={{ flex: 1, accentColor: '#22d3ee' }}
            />
            <div
              style={{
                color: '#22d3ee',
                fontFamily: 'ui-monospace, monospace',
                fontSize: 14,
                fontWeight: 600,
                minWidth: 48,
                textAlign: 'right',
              }}
            >
              {percent}%
            </div>
          </div>
        </div>
      </ThemeProvider>
    );
  },
};

export const KnowYourCodebaseHeart: Story = {
  render: () => {
    const [percent, setPercent] = useState(0);
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
            width: 640,
          }}
        >
          <div
            style={{
              color: '#f8fafc',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 18,
              fontWeight: 600,
              letterSpacing: '0.04em',
            }}
          >
            How well do you know your codebase?
          </div>
          <div style={{ width: 560 }}>
            <FileCityBlockDrop
              imageSrc={HEART_URL}
              revealPercent={percent / 100}
            />
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              width: '100%',
              maxWidth: 560,
            }}
          >
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={percent}
              onChange={e => setPercent(Number(e.target.value))}
              style={{ flex: 1, accentColor: '#22d3ee' }}
            />
            <div
              style={{
                color: '#22d3ee',
                fontFamily: 'ui-monospace, monospace',
                fontSize: 14,
                fontWeight: 600,
                minWidth: 48,
                textAlign: 'right',
              }}
            >
              {percent}%
            </div>
          </div>
        </div>
      </ThemeProvider>
    );
  },
};

export const KnowYourCodebaseGraph: Story = {
  render: () => {
    const [percent, setPercent] = useState(0);
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
            width: 640,
          }}
        >
          <div
            style={{
              color: '#f8fafc',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 18,
              fontWeight: 600,
            }}
          >
            How well do you know your codebase?
          </div>
          <div style={{ width: 560 }}>
            <FileCityBlockDrop image="graph" revealPercent={percent / 100} />
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              width: '100%',
              maxWidth: 560,
            }}
          >
            <input
              type="range"
              min={0}
              max={100}
              value={percent}
              onChange={e => setPercent(Number(e.target.value))}
              style={{ flex: 1, accentColor: '#22d3ee' }}
            />
            <div
              style={{
                color: '#22d3ee',
                fontFamily: 'ui-monospace, monospace',
                fontSize: 14,
                fontWeight: 600,
                minWidth: 48,
                textAlign: 'right',
              }}
            >
              {percent}%
            </div>
          </div>
        </div>
      </ThemeProvider>
    );
  },
};

const HEAD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <ellipse cx="12" cy="12" rx="10" ry="11" fill="none" stroke="#22d3ee" stroke-width="3"/>
</svg>`;
const HEAD_URL = `data:image/svg+xml;base64,${typeof btoa !== 'undefined' ? btoa(HEAD_SVG) : ''}`;

const EYES_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <circle cx="8" cy="9" r="2" fill="#facc15"/>
  <circle cx="16" cy="9" r="2" fill="#facc15"/>
</svg>`;
const EYES_URL = `data:image/svg+xml;base64,${typeof btoa !== 'undefined' ? btoa(EYES_SVG) : ''}`;

const MOUTH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <path d="M7 14 Q12 19 17 14" stroke="#f472b6" stroke-width="3" fill="none" stroke-linecap="round"/>
</svg>`;
const MOUTH_URL = `data:image/svg+xml;base64,${typeof btoa !== 'undefined' ? btoa(MOUTH_SVG) : ''}`;

const FACE_LAYERS = [
  { id: 'head', name: 'AJ — outlines', imageSrc: HEAD_URL },
  { id: 'eyes', name: 'MK — attention', imageSrc: EYES_URL },
  { id: 'mouth', name: 'RT — expression', imageSrc: MOUTH_URL },
];

export const LayeredExpertise: Story = {
  render: () => {
    const [active, setActive] = useState<string[]>(['head']);
    const toggle = (id: string) =>
      setActive(prev =>
        prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
      );
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
            width: 640,
          }}
        >
          <div
            style={{
              color: '#f8fafc',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 16,
              fontWeight: 600,
              letterSpacing: '0.04em',
            }}
          >
            Each engineer knows a different part.
          </div>
          <div style={{ width: 560 }}>
            <FileCityBlockDrop
              cols={16}
              rows={16}
              cellSize={36}
              layers={FACE_LAYERS}
              activeLayerIds={active}
            />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            {FACE_LAYERS.map(layer => {
              const isActive = active.includes(layer.id);
              return (
                <button
                  key={layer.id}
                  onClick={() => toggle(layer.id)}
                  style={{
                    padding: '8px 14px',
                    background: isActive ? '#22d3ee' : 'transparent',
                    color: isActive ? '#0a0f14' : '#94a3b8',
                    border: `1px solid ${isActive ? '#22d3ee' : '#2a3140'}`,
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontFamily: 'ui-monospace, monospace',
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                  }}
                >
                  {layer.name}
                </button>
              );
            })}
          </div>
          <div
            style={{
              color: '#64748b',
              fontFamily: 'ui-monospace, monospace',
              fontSize: 11,
              textAlign: 'center',
            }}
          >
            Toggle engineers to see what they know — and what the team knows together.
          </div>
        </div>
      </ThemeProvider>
    );
  },
};

const SKY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 12">
  <rect x="0" y="0" width="18" height="8" fill="#38bdf8"/>
  <circle cx="3.5" cy="2.5" r="1.9" fill="#facc15"/>
  <circle cx="3.5" cy="2.5" r="2.7" fill="none" stroke="#fde68a" stroke-width="0.3" opacity="0.7"/>
</svg>`;
const SKY_URL = `data:image/svg+xml;base64,${typeof btoa !== 'undefined' ? btoa(SKY_SVG) : ''}`;

const MOUNTAINS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 12">
  <polygon points="0,7 3,4 5,5.5 9,2 12,5 15,3 18,5.5 18,8 0,8" fill="#7c3aed"/>
</svg>`;
const MOUNTAINS_URL = `data:image/svg+xml;base64,${typeof btoa !== 'undefined' ? btoa(MOUNTAINS_SVG) : ''}`;

const FOREST_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 12">
  <rect x="0" y="9" width="18" height="1.4" fill="#10b981"/>
  <circle cx="1.5" cy="9" r="0.9" fill="#10b981"/>
  <circle cx="4" cy="8.7" r="1.1" fill="#10b981"/>
  <circle cx="7" cy="9" r="0.9" fill="#10b981"/>
  <circle cx="10" cy="8.7" r="1.2" fill="#10b981"/>
  <circle cx="13" cy="9" r="1" fill="#10b981"/>
  <circle cx="16" cy="8.8" r="1.1" fill="#10b981"/>
</svg>`;
const FOREST_URL = `data:image/svg+xml;base64,${typeof btoa !== 'undefined' ? btoa(FOREST_SVG) : ''}`;

const GROUND_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 12">
  <rect x="0" y="10.5" width="18" height="1.5" fill="#a16207"/>
</svg>`;
const GROUND_URL = `data:image/svg+xml;base64,${typeof btoa !== 'undefined' ? btoa(GROUND_SVG) : ''}`;

const LANDSCAPE_LAYERS = [
  { id: 'sky', name: 'Sky & sun', imageSrc: SKY_URL },
  { id: 'mountains', name: 'Mountains', imageSrc: MOUNTAINS_URL },
  { id: 'forest', name: 'Forest', imageSrc: FOREST_URL },
  { id: 'ground', name: 'Ground', imageSrc: GROUND_URL },
];

export const LandscapeBuildup: Story = {
  render: () => {
    const [active, setActive] = useState<string[]>(
      LANDSCAPE_LAYERS.map(l => l.id),
    );
    const toggle = (id: string) =>
      setActive(prev =>
        prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
      );
    const allOn = active.length === LANDSCAPE_LAYERS.length;
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
            width: 720,
          }}
        >
          <div
            style={{
              color: '#f8fafc',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 16,
              fontWeight: 600,
              letterSpacing: '0.04em',
            }}
          >
            Each engineer knows a different layer.
          </div>
          <div style={{ width: 660 }}>
            <FileCityBlockDrop
              cols={48}
              rows={32}
              cellSize={13}
              padding={12}
              layers={LANDSCAPE_LAYERS}
              activeLayerIds={active}
            />
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            {LANDSCAPE_LAYERS.map(layer => {
              const isActive = active.includes(layer.id);
              return (
                <button
                  key={layer.id}
                  onClick={() => toggle(layer.id)}
                  style={{
                    padding: '8px 14px',
                    background: isActive ? '#22d3ee' : 'transparent',
                    color: isActive ? '#0a0f14' : '#94a3b8',
                    border: `1px solid ${isActive ? '#22d3ee' : '#2a3140'}`,
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontFamily: 'ui-monospace, monospace',
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                  }}
                >
                  {layer.name}
                </button>
              );
            })}
            <button
              onClick={() =>
                setActive(allOn ? [] : LANDSCAPE_LAYERS.map(l => l.id))
              }
              style={{
                padding: '8px 14px',
                background: 'transparent',
                color: '#94a3b8',
                border: '1px dashed #2a3140',
                borderRadius: 6,
                cursor: 'pointer',
                fontFamily: 'ui-monospace, monospace',
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: '0.04em',
              }}
            >
              {allOn ? 'None' : 'All'}
            </button>
          </div>
          <div
            style={{
              color: '#64748b',
              fontFamily: 'ui-monospace, monospace',
              fontSize: 11,
              textAlign: 'center',
              maxWidth: 480,
            }}
          >
            Solo: see what one engineer knows. Combined: see what the team knows together.
          </div>
        </div>
      </ThemeProvider>
    );
  },
};

interface Rank {
  title: string;
  color: string;
  /** Inclusive lower bound in percent within a single codebase. */
  threshold: number;
}
/** Tiers reachable inside one codebase. Maxing out a codebase lands
 *  you at Senior Contributor; higher tiers unlock across multiple
 *  codebases (see LOCKED_RANKS). */
const SINGLE_CODEBASE_RANKS: ReadonlyArray<Rank> = [
  { title: 'Junior Contributor', color: '#64748b', threshold: 0 },
  { title: 'Contributor', color: '#3b82f6', threshold: 35 },
  { title: 'Senior Contributor', color: '#22d3ee', threshold: 70 },
];
/** Tiers shown as locked in the single-codebase badge — visible so
 *  users see the upward path, but not reachable until they cover more
 *  codebases. */
const LOCKED_RANKS: ReadonlyArray<Rank> = [
  { title: 'Staff Engineer', color: '#a78bfa', threshold: -1 },
  { title: 'Senior Staff Engineer', color: '#e879f9', threshold: -1 },
  { title: 'Principal Engineer', color: '#fb923c', threshold: -1 },
  { title: 'Distinguished Engineer', color: '#facc15', threshold: -1 },
];
function rankFor(percent: number): { current: Rank; next: Rank | null; tierIdx: number } {
  let tierIdx = 0;
  for (let i = SINGLE_CODEBASE_RANKS.length - 1; i >= 0; i--) {
    if (percent >= SINGLE_CODEBASE_RANKS[i]!.threshold) {
      tierIdx = i;
      break;
    }
  }
  return {
    current: SINGLE_CODEBASE_RANKS[tierIdx]!,
    next: tierIdx < SINGLE_CODEBASE_RANKS.length - 1
      ? SINGLE_CODEBASE_RANKS[tierIdx + 1]!
      : null,
    tierIdx,
  };
}

export const MentalModelRank: Story = {
  render: () => {
    const [percent, setPercent] = useState(0);
    const { current, next, tierIdx } = rankFor(percent);
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
            width: 680,
          }}
        >
          <div style={{ width: 600 }}>
            <FileCityBlockDrop
              cols={32}
              rows={24}
              cellSize={18}
              padding={12}
              image="districts"
              revealPercent={percent / 100}
            />
          </div>

          {/* Badge card */}
          <div
            style={{
              width: '100%',
              maxWidth: 600,
              padding: 20,
              background: '#0a0f14',
              border: `1px solid ${current.color}55`,
              borderRadius: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              boxShadow: `0 0 24px ${current.color}22`,
              transition: 'border-color 300ms ease, box-shadow 300ms ease',
            }}
          >
            {/* Tier pips — first 3 are reachable within this codebase;
              * the remaining 4 are locked and shown grayed out as the
              * future upgrade path across more codebases. */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {SINGLE_CODEBASE_RANKS.map((r, i) => (
                <div
                  key={r.title}
                  style={{
                    flex: 1,
                    height: 6,
                    borderRadius: 3,
                    background: i <= tierIdx ? r.color : '#1f2937',
                    transition: 'background 300ms ease',
                  }}
                />
              ))}
              <div
                style={{
                  width: 1,
                  height: 14,
                  background: '#2a3140',
                  margin: '0 4px',
                }}
              />
              {LOCKED_RANKS.map(r => (
                <div
                  key={r.title}
                  title={`${r.title} — unlocks across more codebases`}
                  style={{
                    flex: 1,
                    height: 6,
                    borderRadius: 3,
                    background: `${r.color}22`,
                    border: `1px dashed ${r.color}55`,
                  }}
                />
              ))}
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
              }}
            >
              <div
                style={{
                  color: current.color,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 22,
                  fontWeight: 700,
                  letterSpacing: '0.02em',
                  transition: 'color 300ms ease',
                }}
              >
                {current.title}
              </div>
              <div
                style={{
                  color: '#94a3b8',
                  fontFamily: 'ui-monospace, monospace',
                  fontSize: 12,
                }}
              >
                tier {tierIdx + 1} / {SINGLE_CODEBASE_RANKS.length} · this codebase
              </div>
            </div>

            <div
              style={{
                color: '#cbd5e1',
                fontFamily: 'ui-monospace, monospace',
                fontSize: 12,
              }}
            >
              {percent}% of this codebase is in your mental model.
              {next && (
                <span style={{ color: '#64748b' }}>
                  {' '}
                  Next: <span style={{ color: next.color }}>{next.title}</span>{' '}
                  at {next.threshold}%.
                </span>
              )}
              {!next && (
                <span style={{ color: '#94a3b8' }}>
                  {' '}
                  Max tier for this codebase. Add another to unlock{' '}
                  <span style={{ color: LOCKED_RANKS[0]!.color }}>
                    {LOCKED_RANKS[0]!.title}
                  </span>
                  {' '}and above.
                </span>
              )}
            </div>
          </div>

          {/* Slider */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              width: '100%',
              maxWidth: 600,
            }}
          >
            <input
              type="range"
              min={0}
              max={100}
              value={percent}
              onChange={e => setPercent(Number(e.target.value))}
              style={{ flex: 1, accentColor: current.color }}
            />
            <div
              style={{
                color: current.color,
                fontFamily: 'ui-monospace, monospace',
                fontSize: 14,
                fontWeight: 600,
                minWidth: 48,
                textAlign: 'right',
                transition: 'color 300ms ease',
              }}
            >
              {percent}%
            </div>
          </div>
        </div>
      </ThemeProvider>
    );
  },
};

export const Monochrome: Story = {
  render: () => {
    const [key, setKey] = useState(0);
    return (
      <StoryWrapper>
        <FileCityBlockDrop resetKey={key} colorPieces={false} />
        <ReplayButton onClick={() => setKey(k => k + 1)} />
      </StoryWrapper>
    );
  },
};

export const SmallGrid: Story = {
  render: () => {
    const [key, setKey] = useState(0);
    return (
      <StoryWrapper>
        <FileCityBlockDrop resetKey={key} cols={6} rows={6} cellSize={70} />
        <ReplayButton onClick={() => setKey(k => k + 1)} />
      </StoryWrapper>
    );
  },
};

export const DifferentSeed: Story = {
  render: () => {
    const [key, setKey] = useState(0);
    return (
      <StoryWrapper>
        <FileCityBlockDrop resetKey={key} seed={42} />
        <ReplayButton onClick={() => setKey(k => k + 1)} />
      </StoryWrapper>
    );
  },
};

export const FullyRevealed: Story = {
  render: () => (
    <StoryWrapper>
      <FileCityBlockDrop autoStart={false} />
    </StoryWrapper>
  ),
};
