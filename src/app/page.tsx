'use client';

import Link from 'next/link';
import { useTheme } from '@principal-ade/industry-theme';
import { X, MoveRight, Copy, Check, ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { TrailCityDiagram } from '@/components/trail/TrailCityDiagram';
import { LgtmStamp, SignOffStampAnimation } from '@/components/trail/LgtmStamp';

export const dynamic = 'force-dynamic';

type StampKind = 'LGTM' | 'ACK';

export default function HomePage() {
  const { theme } = useTheme();
  const [view, setView] = useState<'title' | 'fileCity' | 'codeTrail' | 'whyTrails' | 'stamped'>('title');
  const [revealStep, setRevealStep] = useState(0);
  const [stepsRevealed, setStepsRevealed] = useState(0);
  const [diagramRevealed, setDiagramRevealed] = useState(false);
  const [diagramHovered, setDiagramHovered] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [stamp, setStamp] = useState<StampKind | null>(null);
  const [stampAnimating, setStampAnimating] = useState(false);
  const showExplanation = view !== 'title';
  const showTitle = revealStep >= 1;
  const showSubtitle = revealStep >= 2;
  const showHint = view === 'title' && revealStep >= 3;
  const diagramBorderActive = diagramHovered || view === 'fileCity';

  const STEP_COUNT = 13;
  const STEP_INTERVAL = 220;
  const STEP_START = 300;

  const handleStamp = (kind: StampKind) => {
    if (stampAnimating || stamp) return;
    setStamp(kind);
    setStampAnimating(true);
    // Match the SignOffStampAnimation keyframe duration; advance to the
    // backlog / create-your-own step the moment the stamp settles.
    setTimeout(() => {
      setStampAnimating(false);
      setView('stamped');
    }, 1100);
  };

  const resetToTitle = () => {
    setView('title');
    setStamp(null);
    setStampAnimating(false);
  };

  useEffect(() => {
    const stepTimers = Array.from({ length: STEP_COUNT }, (_, i) =>
      setTimeout(() => setStepsRevealed(i + 1), STEP_START + i * STEP_INTERVAL),
    );
    const stepsDoneAt = STEP_START + STEP_COUNT * STEP_INTERVAL;
    const diagramTimer = setTimeout(() => setDiagramRevealed(true), stepsDoneAt + 200);
    const titleTimer = setTimeout(() => setRevealStep(1), stepsDoneAt + 1500);
    const subtitleTimer = setTimeout(() => setRevealStep(2), stepsDoneAt + 2500);
    const exploreTimer = setTimeout(() => setRevealStep(3), stepsDoneAt + 3500);
    return () => {
      stepTimers.forEach(clearTimeout);
      clearTimeout(diagramTimer);
      clearTimeout(titleTimer);
      clearTimeout(subtitleTimer);
      clearTimeout(exploreTimer);
    };
  }, []);

  return (
    <div
      className="h-viewport-fixed flex flex-col overflow-auto relative"
      style={{ background: theme.colors.background, color: theme.colors.text }}
    >
      {/* Ambient backdrop — out-of-focus city + trail fragments. */}
      <TrailBackdrop theme={theme} />

      <header
        className="sticky top-0 z-30 border-b backdrop-blur-xl"
        style={{
          borderColor: `color-mix(in srgb, ${theme.colors.border} 60%, transparent)`,
          background: `color-mix(in srgb, ${theme.colors.background} 55%, transparent)`,
        }}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center">
            <h1
              className="text-2xl font-bold m-0"
              style={{ fontFamily: theme.fonts.body }}
            >
              <span style={{ color: theme.colors.text }}>Principal</span>
              {' '}
              <span style={{ color: theme.colors.primary }}>AI</span>
            </h1>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col relative">
        <section className="flex-1 w-full max-w-7xl mx-auto px-6 py-16 flex items-start">
          <div className="w-full grid lg:grid-cols-2 gap-12 lg:gap-10 items-start">
            <div className="relative text-center lg:text-left min-h-[260px] lg:pt-24">
              {/* Title — fades out when the user opens the file-city explanation. */}
              <div
                className={`transition-opacity duration-300 ${showExplanation ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
                aria-hidden={showExplanation}
              >
                <div
                  className="flex items-center justify-center lg:justify-start gap-7 mb-6 h-12"
                  aria-hidden
                >
                  {Array.from({ length: STEP_COUNT }).map((_, i) => {
                    const side = i % 2 === 0 ? 'left' : 'right';
                    return (
                      <span
                        key={i}
                        className="inline-block transition-opacity duration-500 ease-out"
                        style={{
                          opacity: i < stepsRevealed ? 1 : 0,
                          transform: `translateY(${side === 'left' ? '-7px' : '7px'}) rotate(90deg)`,
                          transformOrigin: 'center',
                        }}
                      >
                        <Footprint side={side} size={18} color={theme.colors.primary} />
                      </span>
                    );
                  })}
                </div>

                <h1
                  className={`text-6xl md:text-7xl xl:text-8xl font-semibold tracking-tight leading-[0.95] mb-6 transition-opacity duration-700 ease-out ${
                    showTitle ? 'opacity-100' : 'opacity-0'
                  }`}
                  style={{ color: theme.colors.primary }}
                >
                  Code trails
                </h1>

                <p
                  className={`text-xl md:text-2xl max-w-xl mx-auto lg:mx-0 lg:pl-5 leading-relaxed mb-6 transition-opacity duration-700 ease-out ${
                    showSubtitle ? 'opacity-100' : 'opacity-0'
                  }`}
                  style={{ color: theme.colors.text }}
                >
                  A new way to collaborate on software
                </p>

                <div
                  className={`lg:pl-5 flex items-center justify-center lg:justify-start gap-2 transition-opacity duration-700 ease-out ${
                    showHint ? 'opacity-100' : 'opacity-0 pointer-events-none'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setView('fileCity')}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md text-base font-medium transition-colors hover:opacity-80"
                    style={{
                      background: `color-mix(in srgb, ${theme.colors.primary} 18%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${theme.colors.primary} 50%, transparent)`,
                      color: theme.colors.primary,
                    }}
                  >
                    Explore
                    <MoveRight
                      size={18}
                      strokeWidth={2.25}
                      className="hint-arrow-bounce"
                    />
                  </button>
                </div>
                <style>{`
                  @keyframes hintArrow {
                    0%, 100% { transform: translateX(0); }
                    50% { transform: translateX(6px); }
                  }
                  .hint-arrow-bounce { animation: hintArrow 1.1s ease-in-out infinite; }
                `}</style>
              </div>

              {/* File-city explanation. */}
              <div
                className={`absolute inset-x-0 bottom-0 top-32 transition-opacity duration-300 ${view === 'fileCity' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                aria-hidden={view !== 'fileCity'}
              >
                <div className="flex items-start justify-between gap-4 mb-4">
                  <h2
                    className="text-3xl md:text-4xl font-semibold tracking-tight"
                    style={{ color: theme.colors.primary }}
                  >
                    What&rsquo;s a File City?
                  </h2>
                  <button
                    onClick={() => setView('title')}
                    className="rounded-md p-1.5 transition-colors hover:opacity-80"
                    style={{
                      border: `1px solid color-mix(in srgb, ${theme.colors.border} 70%, transparent)`,
                      color: theme.colors.textMuted,
                    }}
                    aria-label="Close explanation"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div
                  className="text-base md:text-lg leading-relaxed mb-6"
                  style={{ color: theme.colors.text }}
                >
                  <p>
                    A 2D view of a file tree where each square is a file.
                    It allows us to overlay trails.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setView('codeTrail')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors hover:opacity-80"
                  style={{
                    background: `color-mix(in srgb, ${theme.colors.primary} 18%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${theme.colors.primary} 50%, transparent)`,
                    color: theme.colors.primary,
                  }}
                >
                  What is a Code Trail?
                </button>
              </div>

              {/* Code-trail explanation. */}
              <div
                className={`absolute inset-x-0 bottom-0 top-32 transition-opacity duration-300 ${view === 'codeTrail' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                aria-hidden={view !== 'codeTrail'}
              >
                <div className="flex items-start justify-between gap-4 mb-4">
                  <h2
                    className="text-3xl md:text-4xl font-semibold tracking-tight"
                    style={{ color: theme.colors.primary }}
                  >
                    What is a Code Trail?
                  </h2>
                  <button
                    onClick={() => setView('title')}
                    className="rounded-md p-1.5 transition-colors hover:opacity-80"
                    style={{
                      border: `1px solid color-mix(in srgb, ${theme.colors.border} 70%, transparent)`,
                      color: theme.colors.textMuted,
                    }}
                    aria-label="Close explanation"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div
                  className="text-base md:text-lg leading-relaxed mb-6"
                  style={{ color: theme.colors.text }}
                >
                  <p>
                    It is a walk through your codebase that explains a concept.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setView(stamp ? 'stamped' : 'whyTrails')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors hover:opacity-80"
                  style={{
                    background: `color-mix(in srgb, ${theme.colors.primary} 18%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${theme.colors.primary} 50%, transparent)`,
                    color: theme.colors.primary,
                  }}
                >
                  Why do I need Code Trails?
                </button>
              </div>

              {/* Why-trails / Mark Twain quote — sign-off step. */}
              <div
                className={`absolute inset-x-0 bottom-0 top-32 transition-opacity duration-300 ${view === 'whyTrails' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                aria-hidden={view !== 'whyTrails'}
              >
                <div className="flex items-start justify-between gap-4 mb-4">
                  <h2
                    className="text-3xl md:text-4xl font-semibold tracking-tight"
                    style={{ color: theme.colors.primary }}
                  >
                    Why do I need Code Trails?
                  </h2>
                  <button
                    onClick={() => setView('title')}
                    className="rounded-md p-1.5 transition-colors hover:opacity-80"
                    style={{
                      border: `1px solid color-mix(in srgb, ${theme.colors.border} 70%, transparent)`,
                      color: theme.colors.textMuted,
                    }}
                    aria-label="Close explanation"
                  >
                    <X size={16} />
                  </button>
                </div>
                <p
                  className="text-xl md:text-2xl mb-3"
                  style={{ color: theme.colors.text }}
                >
                  Because
                </p>
                <blockquote
                  className="border-l-2 pl-5 text-xl md:text-2xl xl:text-3xl leading-relaxed italic mb-6"
                  style={{
                    borderColor: theme.colors.primary,
                    color: theme.colors.text,
                  }}
                >
                  <p className="mb-3">
                    &ldquo;It ain&rsquo;t what you don&rsquo;t know that gets
                    you into trouble.{' '}
                    <span style={{ color: theme.colors.primary }}>
                      It&rsquo;s what you know for sure that just ain&rsquo;t so.
                    </span>
                    &rdquo;
                  </p>
                  <footer
                    className="text-base md:text-lg not-italic"
                    style={{ color: theme.colors.textMuted }}
                  >
                    — Mark Twain
                  </footer>
                </blockquote>
                <p
                  className="text-sm md:text-base mb-3"
                  style={{ color: theme.colors.textMuted }}
                >
                  Sign off on this trail to continue.
                </p>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 text-base">
                  <button
                    type="button"
                    onClick={() => handleStamp('LGTM')}
                    disabled={stampAnimating || stamp !== null}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-md font-mono font-semibold tracking-wider transition-opacity hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{
                      background: theme.colors.success,
                      color: theme.colors.background,
                      letterSpacing: '0.12em',
                    }}
                    aria-label="Sign off with LGTM"
                  >
                    LGTM
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStamp('ACK')}
                    disabled={stampAnimating || stamp !== null}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-md font-mono font-semibold tracking-wider transition-colors hover:opacity-80 disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{
                      background: `color-mix(in srgb, ${theme.colors.success} 16%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${theme.colors.success} 60%, transparent)`,
                      color: theme.colors.success,
                      letterSpacing: '0.12em',
                    }}
                    aria-label="Acknowledge with ACK"
                  >
                    ACK
                  </button>
                </div>
              </div>

              {/* Stamped — backlog / create-your-own follow-ups. */}
              <div
                className={`absolute inset-x-0 bottom-0 top-32 transition-opacity duration-300 ${view === 'stamped' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                aria-hidden={view !== 'stamped'}
              >
                <div className="flex items-start justify-between gap-4 mb-4">
                  <h2
                    className="text-3xl md:text-4xl font-semibold tracking-tight"
                    style={{ color: theme.colors.primary }}
                  >
                    Trail signed.
                  </h2>
                  <button
                    onClick={resetToTitle}
                    className="rounded-md p-1.5 transition-colors hover:opacity-80"
                    style={{
                      border: `1px solid color-mix(in srgb, ${theme.colors.border} 70%, transparent)`,
                      color: theme.colors.textMuted,
                    }}
                    aria-label="Close"
                  >
                    <X size={16} />
                  </button>
                </div>
                <p
                  className="text-base md:text-lg leading-relaxed mb-6"
                  style={{ color: theme.colors.text }}
                >
                  Now take your own walk — explore the backlog or stamp your codebase with a new trail.
                </p>
                <div className="flex flex-col sm:flex-row sm:items-center sm:flex-wrap gap-x-3 gap-y-2 text-base">
                  <a
                    href="https://app.principal-ade.com/trail/backlog-task-create-flow"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md font-medium transition-opacity hover:opacity-90"
                    style={{
                      background: theme.colors.primary,
                      color: theme.colors.background,
                    }}
                  >
                    Take a stroll through Backlog.md
                  </a>
                  <span style={{ color: theme.colors.textMuted }}>or</span>
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md font-medium transition-colors hover:opacity-80"
                    style={{
                      background: `color-mix(in srgb, ${theme.colors.primary} 18%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${theme.colors.primary} 50%, transparent)`,
                      color: theme.colors.primary,
                    }}
                  >
                    create your own trail
                  </button>
                </div>
              </div>
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  if (stampAnimating) return;
                  setView(v => (v === 'fileCity' ? 'title' : 'fileCity'));
                }}
                className={`group rounded-2xl overflow-hidden backdrop-blur-xl p-2 cursor-pointer text-left transition-opacity duration-700 ease-out w-full ${
                  diagramRevealed ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
                style={{
                  background: `color-mix(in srgb, ${theme.colors.surface} 35%, transparent)`,
                }}
                onMouseEnter={() => setDiagramHovered(true)}
                onMouseLeave={() => setDiagramHovered(false)}
                aria-label={showExplanation ? 'Hide file-city explanation' : 'Show file-city explanation'}
                aria-pressed={showExplanation}
                aria-hidden={!diagramRevealed}
              >
                <div
                  className="rounded-xl overflow-hidden transition-colors duration-200"
                  style={{
                    border: `1px solid ${
                      diagramBorderActive
                        ? `color-mix(in srgb, ${theme.colors.primary} 70%, transparent)`
                        : `color-mix(in srgb, ${theme.colors.border} 50%, transparent)`
                    }`,
                  }}
                >
                  <TrailCityDiagram
                    highlightTrail={view === 'codeTrail'}
                    hideTrail={view === 'fileCity'}
                    hideSnippet={view === 'fileCity' || view === 'codeTrail'}
                  />
                </div>
              </button>

              {/* Sign-off stamp animation overlays the diagram during the
                  1100ms landing beat. */}
              {stampAnimating && stamp && (
                <SignOffStampAnimation theme={theme} text={stamp} size={220} />
              )}

              {/* Corner stamp — preview on the title view (shows the
                  goal-state trail), then re-appears once the visitor
                  actually signs. Hidden during fileCity / codeTrail /
                  whyTrails so each step reveals one piece at a time. */}
              {!stampAnimating && (stamp || view === 'title') && (
                <div
                  aria-hidden
                  className={`absolute pointer-events-none transition-opacity duration-700 ease-out ${
                    diagramRevealed ? 'opacity-100' : 'opacity-0'
                  }`}
                  style={{
                    top: 18,
                    right: 18,
                    transform: 'rotate(-8deg)',
                    // Only animate the "lands in the corner" beat after
                    // a real sign-off; on the title preview the stamp
                    // shares the diagram's fade-in instead.
                    animation: stamp ? 'stamp-settle 320ms ease-out both' : undefined,
                  }}
                >
                  <style>{`
                    @keyframes stamp-settle {
                      0%   { transform: scale(1.6) rotate(-8deg); opacity: 0; }
                      100% { transform: scale(1) rotate(-8deg); opacity: 1; }
                    }
                  `}</style>
                  <LgtmStamp
                    theme={theme}
                    size={96}
                    rotated={false}
                    text={stamp ?? 'LGTM'}
                  />
                </div>
              )}
            </div>
          </div>
        </section>

      </main>

      <footer
        className="border-t text-xs backdrop-blur-xl relative z-10"
        style={{
          borderColor: `color-mix(in srgb, ${theme.colors.border} 60%, transparent)`,
          background: `color-mix(in srgb, ${theme.colors.background} 55%, transparent)`,
          color: theme.colors.textMuted,
        }}
      >
        <div className="max-w-7xl mx-auto px-6 py-6">
          <span>© {new Date().getFullYear()} Principal AI</span>
        </div>
      </footer>

      <CreateTrailModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        theme={theme}
      />
    </div>
  );
}

function Footprint({
  side,
  size = 24,
  color,
  strokeWidth = 2,
}: {
  side: 'left' | 'right';
  size?: number;
  color: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="2 1 9 18"
      width={size}
      height={size * (18 / 9)}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: side === 'right' ? 'scaleX(-1)' : undefined }}
      aria-hidden
    >
      <path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z" />
      <path d="M4 13h4" />
    </svg>
  );
}

type TrailMode = 'self' | 'share';

const TRAIL_MODES: Record<TrailMode, {
  label: string;
  description: string;
  skillName: string;
  skillUrl: string;
  prompt: string;
}> = {
  self: {
    label: 'Trail for Myself',
    description: 'Walk a codebase locally to learn or onboard — no publish step.',
    skillName: 'local-trails',
    skillUrl: 'https://github.com/principal-ai/skills/blob/main/local-trails/SKILL.md',
    prompt: `Read the local-trails skill at https://github.com/principal-ai/skills/blob/main/local-trails/SKILL.md and use it to walk me through <topic>.`,
  },
  share: {
    label: 'To Share',
    description: 'Pick markers and publish a shareable trail others can follow.',
    skillName: 'publish-trail',
    skillUrl: 'https://github.com/principal-ai/skills/blob/main/publish-trail/SKILL.md',
    prompt: `Read the publish-trail skill at https://github.com/principal-ai/skills/blob/main/publish-trail/SKILL.md and use it to walk me through <topic>.`,
  },
};

function CreateTrailModal({
  open,
  onClose,
  theme,
}: {
  open: boolean;
  onClose: () => void;
  theme: ReturnType<typeof useTheme>['theme'];
}) {
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<TrailMode | null>(null);

  // Esc closes the modal.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Reset state when the modal closes so the next open starts fresh.
  useEffect(() => {
    if (!open) {
      setCopied(false);
      setMode(null);
    }
  }, [open]);

  const selected = mode ? TRAIL_MODES[mode] : null;

  const handleCopy = async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected.prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be denied — user can select and copy manually.
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Create your own trail"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 backdrop-blur-md"
        style={{ background: `color-mix(in srgb, ${theme.colors.background} 70%, transparent)` }}
      />

      {/* Card */}
      <div
        className="relative w-full max-w-xl rounded-2xl p-6 backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: `color-mix(in srgb, ${theme.colors.surface} 85%, transparent)`,
          border: `1px solid color-mix(in srgb, ${theme.colors.primary} 35%, transparent)`,
          boxShadow: `0 30px 80px -20px color-mix(in srgb, ${theme.colors.primary} 25%, transparent)`,
        }}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <h3
            className="text-2xl font-semibold tracking-tight"
            style={{ color: theme.colors.primary }}
          >
            {selected ? selected.label : 'Create your own trail'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 transition-colors hover:opacity-80"
            style={{
              border: `1px solid color-mix(in srgb, ${theme.colors.border} 70%, transparent)`,
              color: theme.colors.textMuted,
            }}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {!selected ? (
          <>
            <p
              className="text-sm md:text-base leading-relaxed mb-5"
              style={{ color: theme.colors.text }}
            >
              How do you want to use this trail?
            </p>
            <div className="flex flex-col gap-3">
              {(['self', 'share'] as const).map((key) => {
                const opt = TRAIL_MODES[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setMode(key)}
                    className="text-left rounded-lg p-4 transition-colors hover:opacity-90"
                    style={{
                      background: `color-mix(in srgb, ${theme.colors.primary} 12%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${theme.colors.primary} 45%, transparent)`,
                    }}
                  >
                    <div
                      className="text-base font-semibold mb-1"
                      style={{ color: theme.colors.primary }}
                    >
                      {opt.label}
                    </div>
                    <div
                      className="text-sm leading-relaxed"
                      style={{ color: theme.colors.text }}
                    >
                      {opt.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <p
              className="text-sm md:text-base leading-relaxed mb-4"
              style={{ color: theme.colors.text }}
            >
              Drop this prompt into your agent. It uses the{' '}
              <code style={{ color: theme.colors.primary }}>{selected.skillName}</code>{' '}
              skill to {mode === 'self'
                ? 'walk you through your codebase locally.'
                : 'pick markers from your codebase and publish a shareable trail.'}
            </p>

            <div
              className="rounded-lg p-4 mb-4 font-mono text-sm leading-relaxed whitespace-pre-wrap"
              style={{
                background: `color-mix(in srgb, ${theme.colors.background} 70%, transparent)`,
                border: `1px solid color-mix(in srgb, ${theme.colors.border} 60%, transparent)`,
                color: theme.colors.text,
              }}
            >
              {selected.prompt}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-opacity hover:opacity-90"
                style={{
                  background: theme.colors.primary,
                  color: theme.colors.background,
                }}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Copied' : 'Copy prompt'}
              </button>
              <a
                href={selected.skillUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors hover:opacity-80"
                style={{
                  background: `color-mix(in srgb, ${theme.colors.primary} 18%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${theme.colors.primary} 50%, transparent)`,
                  color: theme.colors.primary,
                }}
              >
                <ExternalLink size={14} />
                View skill
              </a>
              <button
                type="button"
                onClick={() => {
                  setMode(null);
                  setCopied(false);
                }}
                className="inline-flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors hover:opacity-80 sm:ml-auto"
                style={{
                  border: `1px solid color-mix(in srgb, ${theme.colors.border} 70%, transparent)`,
                  color: theme.colors.textMuted,
                }}
              >
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface BackdropTheme {
  colors: {
    primary?: string;
    accent?: string;
    text?: string;
  };
}

function TrailBackdrop({ theme }: { theme: BackdropTheme }) {
  const accent = theme.colors.accent ?? theme.colors.primary ?? '#22d3ee';
  const primary = theme.colors.primary ?? '#22d3ee';
  const text = theme.colors.text ?? '#f8fafc';

  // One out-of-focus city + trail spread across the whole viewport.
  // Coordinates live in a 1600×1000 design space; the SVG uses
  // preserveAspectRatio="xMidYMid slice" so it covers the page like a
  // background image regardless of window aspect.
  const blocks = [
    { x: 60, y: 80, w: 180, h: 140, fill: primary, op: 0.5 },
    { x: 280, y: 40, w: 110, h: 180, fill: accent, op: 0.45 },
    { x: 430, y: 110, w: 160, h: 130, fill: primary, op: 0.35 },
    { x: 640, y: 60, w: 130, h: 170, fill: accent, op: 0.4 },
    { x: 820, y: 100, w: 180, h: 150, fill: primary, op: 0.3 },
    { x: 1050, y: 50, w: 140, h: 200, fill: accent, op: 0.45 },
    { x: 1240, y: 90, w: 200, h: 160, fill: primary, op: 0.35 },
    { x: 100, y: 320, w: 150, h: 130, fill: accent, op: 0.4 },
    { x: 290, y: 360, w: 220, h: 110, fill: primary, op: 0.3 },
    { x: 560, y: 330, w: 130, h: 160, fill: accent, op: 0.45 },
    { x: 740, y: 380, w: 180, h: 130, fill: primary, op: 0.35 },
    { x: 970, y: 320, w: 160, h: 170, fill: accent, op: 0.4 },
    { x: 1180, y: 360, w: 220, h: 140, fill: primary, op: 0.3 },
    { x: 50, y: 580, w: 200, h: 140, fill: accent, op: 0.4 },
    { x: 300, y: 620, w: 130, h: 110, fill: primary, op: 0.35 },
    { x: 480, y: 580, w: 180, h: 160, fill: accent, op: 0.45 },
    { x: 710, y: 620, w: 160, h: 120, fill: primary, op: 0.3 },
    { x: 920, y: 580, w: 200, h: 150, fill: accent, op: 0.4 },
    { x: 1170, y: 600, w: 180, h: 140, fill: primary, op: 0.35 },
    { x: 180, y: 800, w: 160, h: 120, fill: text, op: 0.15 },
    { x: 400, y: 820, w: 220, h: 100, fill: primary, op: 0.3 },
    { x: 680, y: 800, w: 180, h: 130, fill: accent, op: 0.35 },
    { x: 920, y: 820, w: 160, h: 110, fill: text, op: 0.18 },
    { x: 1140, y: 800, w: 200, h: 130, fill: accent, op: 0.3 },
  ];

  // Trail snakes diagonally across the whole field, hopping between
  // blocks. Markers sit on each waypoint.
  const trailPoints = [
    { x: 150, y: 150 },
    { x: 360, y: 130 },
    { x: 720, y: 250 },
    { x: 920, y: 420 },
    { x: 1130, y: 380 },
    { x: 1320, y: 600 },
    { x: 1080, y: 720 },
    { x: 760, y: 680 },
    { x: 480, y: 820 },
  ];
  const trailD = trailPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
      style={{ filter: 'blur(20px)', opacity: 0.05 }}
    >
      <svg
        viewBox="0 0 1600 1000"
        preserveAspectRatio="xMidYMid slice"
        style={{ width: '100%', height: '100%' }}
      >
        {blocks.map((b, i) => (
          <rect
            key={i}
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            rx={10}
            fill={b.fill}
            opacity={b.op}
          />
        ))}
        <path
          d={trailD}
          fill="none"
          stroke={accent}
          strokeWidth={6}
          strokeDasharray="14 10"
          strokeLinecap="round"
          opacity={0.7}
        />
        {trailPoints.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={9} fill={accent} opacity={0.85} />
        ))}
      </svg>
    </div>
  );
}
