'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTheme } from '@principal-ade/industry-theme';
import {
  X,
  MoveRight,
  Copy,
  Check,
  ExternalLink,
  Search,
  Plus,
  Sparkles,
  Footprints,
  Folder,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { TrailCityDiagram } from '@/components/trail/TrailCityDiagram';
import { LgtmStamp, SignOffStampAnimation } from '@/components/trail/LgtmStamp';
import { UserAvatarMenu } from '@/components/UserAvatarMenu';
import { useAuth, type User } from '@/contexts/AuthContext';
import type { TopicByUserEntry } from '@/lib/topics/types';
import type { TrailByUserEntry } from '@/lib/trails/types';

export const dynamic = 'force-dynamic';

type StampKind = 'LGTM' | 'ACK';

function parseGithubRepoPath(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Strip protocol / host / leading slash so we end up with `owner/repo[/...]`.
  const stripped = trimmed
    .replace(/^https?:\/\//i, '')
    .replace(/^github\.com\//i, '')
    .replace(/^\/+/, '');
  const [owner, repoRaw] = stripped.split('/');
  if (!owner || !repoRaw) return null;
  const repo = repoRaw.replace(/\.git$/i, '');
  if (!repo) return null;
  return { owner, repo };
}

export default function HomePage() {
  const { theme } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const signedIn = !!user;
  const [repoUrl, setRepoUrl] = useState('');
  const [repoFocused, setRepoFocused] = useState(false);
  const [flashLabel, setFlashLabel] = useState<string | null>(null);
  const [flashTyped, setFlashTyped] = useState('');

  // Type out the flash label one character at a time, then navigate when done.
  useEffect(() => {
    if (flashLabel === null) {
      setFlashTyped('');
      return;
    }
    setFlashTyped('');
    let i = 0;
    const id = setInterval(() => {
      i++;
      setFlashTyped(flashLabel.slice(0, i));
      if (i >= flashLabel.length) clearInterval(id);
    }, 30);
    return () => clearInterval(id);
  }, [flashLabel]);

  const navigateToRepo = (owner: string, repo: string) => {
    const message = `Opening ${owner}/${repo}`;
    const duration = message.length * 30 + 350;
    setFlashLabel(message);
    setTimeout(() => router.push(`/${owner}/${repo}`), duration);
  };

  const handleRepoUrlPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    const parsed = parseGithubRepoPath(pasted);
    if (!parsed) return;
    e.preventDefault();
    setRepoUrl(pasted);
    navigateToRepo(parsed.owner, parsed.repo);
  };

  const handleRepoUrlKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const parsed = parseGithubRepoPath(repoUrl);
    if (!parsed) return;
    navigateToRepo(parsed.owner, parsed.repo);
  };
  type View = 'title' | 'fileCity' | 'codeTrail' | 'whyTrails' | 'stamped';
  const [view, setView] = useState<View>('title');
  const [fading, setFading] = useState(false);
  const VIEW_FADE_MS = 700;
  const viewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goToView = (next: View) => {
    if (viewTimerRef.current) clearTimeout(viewTimerRef.current);
    if (next === view) return;
    setFading(true);
    viewTimerRef.current = setTimeout(() => {
      setView(next);
      setFading(false);
    }, VIEW_FADE_MS);
  };
  useEffect(() => () => {
    if (viewTimerRef.current) clearTimeout(viewTimerRef.current);
  }, []);
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
  const diagramBorderActive = diagramHovered;

  const STEP_COUNT = 13;
  const STEP_INTERVAL = 220;
  const STEP_START = 300;

  const FILE_CITY_BLURB_LINE_1 = 'A 2D view of a file tree where each square is a file.';
  const FILE_CITY_BLURB_LINE_2 = 'This is the heart of code trails.';
  const FILE_CITY_TOTAL_CHARS = FILE_CITY_BLURB_LINE_1.length + FILE_CITY_BLURB_LINE_2.length;
  const FILE_CITY_TYPE_INTERVAL = 28;
  const FILE_CITY_TYPE_DELAY = 900;
  const FILE_CITY_LINE_PAUSE = 600;
  const [fileCityTyped, setFileCityTyped] = useState(0);
  const fileCityTypingDone = fileCityTyped >= FILE_CITY_TOTAL_CHARS;

  useEffect(() => {
    if (view !== 'fileCity') {
      setFileCityTyped(0);
      return;
    }
    if (fileCityTyped >= FILE_CITY_TOTAL_CHARS) return;
    const firstLineLength = FILE_CITY_BLURB_LINE_1.length;
    const delay =
      fileCityTyped === 0
        ? FILE_CITY_TYPE_DELAY
        : fileCityTyped === firstLineLength
          ? FILE_CITY_LINE_PAUSE
          : FILE_CITY_TYPE_INTERVAL;
    const timer = setTimeout(() => setFileCityTyped((n) => n + 1), delay);
    return () => clearTimeout(timer);
  }, [view, fileCityTyped]);

  const CODE_TRAIL_BLURB =
    'It’s a guided walk through a codebase that focuses on what you need to know in that moment.';
  const [codeTrailTyped, setCodeTrailTyped] = useState(0);
  const codeTrailTypingDone = codeTrailTyped >= CODE_TRAIL_BLURB.length;

  useEffect(() => {
    if (view !== 'codeTrail') {
      setCodeTrailTyped(0);
      return;
    }
    if (codeTrailTyped >= CODE_TRAIL_BLURB.length) return;
    const delay =
      codeTrailTyped === 0 ? FILE_CITY_TYPE_DELAY : FILE_CITY_TYPE_INTERVAL;
    const timer = setTimeout(() => setCodeTrailTyped((n) => n + 1), delay);
    return () => clearTimeout(timer);
  }, [view, codeTrailTyped]);

  // Holds the trail off-screen on the codeTrail step until 700ms after
  // typing finishes — same beat the snippet uses on the fileCity step.
  const [codeTrailRevealed, setCodeTrailRevealed] = useState(false);
  useEffect(() => {
    if (view !== 'codeTrail' || !codeTrailTypingDone) {
      setCodeTrailRevealed(false);
      return;
    }
    const t = setTimeout(() => setCodeTrailRevealed(true), 700);
    return () => clearTimeout(t);
  }, [view, codeTrailTypingDone]);

  const WHY_LINE_1 =
    'They’re the quickest way for multiple parties to align on intent.';
  const WHY_LINE_2 =
    'Whether it’s you and your agent, or you and your team.';
  const WHY_LINE_3 =
    'Code trails help visualize comprehension debt. You don’t have to write the code to maintain a mental model, but you do have to ensure the implementation aligns with your intent.';
  const WHY_LINE_1_END = WHY_LINE_1.length;
  const WHY_LINE_2_END = WHY_LINE_1_END + WHY_LINE_2.length;
  const WHY_TOTAL = WHY_LINE_2_END + WHY_LINE_3.length;
  const [whyTyped, setWhyTyped] = useState(0);
  const whyTypingDone = whyTyped >= WHY_TOTAL;

  useEffect(() => {
    if (view !== 'whyTrails') {
      setWhyTyped(0);
      return;
    }
    if (whyTyped >= WHY_TOTAL) return;
    const delay =
      whyTyped === 0
        ? FILE_CITY_TYPE_DELAY
        : whyTyped === WHY_LINE_1_END || whyTyped === WHY_LINE_2_END
          ? FILE_CITY_LINE_PAUSE
          : FILE_CITY_TYPE_INTERVAL;
    const timer = setTimeout(() => setWhyTyped((n) => n + 1), delay);
    return () => clearTimeout(timer);
  }, [view, whyTyped]);

  const handleStamp = (kind: StampKind) => {
    if (stampAnimating || stamp) return;
    setStamp(kind);
    setStampAnimating(true);
    // Match the SignOffStampAnimation keyframe duration; advance to the
    // backlog / create-your-own step the moment the stamp settles.
    setTimeout(() => {
      setStampAnimating(false);
      goToView('stamped');
    }, 1100);
  };

  const resetToTitle = () => {
    setStampAnimating(false);
    if (viewTimerRef.current) clearTimeout(viewTimerRef.current);
    if (view === 'title') {
      setStamp(null);
      return;
    }
    setFading(true);
    viewTimerRef.current = setTimeout(() => {
      setView('title');
      setFading(false);
      setStamp(null);
    }, VIEW_FADE_MS);
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
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 px-6 py-4">
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
          <div className="flex items-center gap-3">
          <div
            role="search"
            aria-label="Open a GitHub repository"
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 transition-colors ${
              flashLabel ? 'repo-url-flash' : ''
            }`}
            style={{
              background: `color-mix(in srgb, ${theme.colors.surface} 60%, transparent)`,
              border: `1px solid ${
                flashLabel
                  ? '#22c55e'
                  : repoFocused
                    ? `color-mix(in srgb, ${theme.colors.primary} 70%, transparent)`
                    : `color-mix(in srgb, ${theme.colors.border} 70%, transparent)`
              }`,
              transition: 'border-color 0.2s, box-shadow 0.2s, background-color 0.15s',
            }}
          >
            <style>{`
              @keyframes repoUrlFlashGlow {
                0%   { box-shadow: 0 0 0 0px rgba(34,197,94,0.5); }
                30%  { box-shadow: 0 0 0 4px rgba(34,197,94,0.25); }
                100% { box-shadow: 0 0 0 3px rgba(34,197,94,0.0); }
              }
              .repo-url-flash { animation: repoUrlFlashGlow 0.6s ease-out forwards; }
            `}</style>
            {flashLabel ? (
              <ExternalLink size={14} color="#22c55e" style={{ flexShrink: 0 }} />
            ) : (
              <Search
                size={14}
                color={repoFocused ? theme.colors.primary : theme.colors.textMuted}
                style={{ flexShrink: 0, transition: 'color 0.15s' }}
              />
            )}
            <input
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={flashLabel !== null ? flashTyped : repoUrl}
              readOnly={flashLabel !== null}
              onChange={(e) => setRepoUrl(e.target.value)}
              onPaste={handleRepoUrlPaste}
              onKeyDown={handleRepoUrlKeyDown}
              onFocus={() => setRepoFocused(true)}
              onBlur={() => setRepoFocused(false)}
              placeholder="Paste GitHub URL"
              aria-label="GitHub repository URL"
              className="w-56 sm:w-72 bg-transparent border-0 outline-none text-sm"
              style={{
                color: flashLabel ? '#22c55e' : theme.colors.text,
                transition: 'color 0.2s',
              }}
            />
          </div>
            <UserAvatarMenu />
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col relative">
        {signedIn ? (
          <SignedInDashboard user={user} theme={theme} />
        ) : (
        <section className="flex-1 w-full max-w-7xl mx-auto px-6 py-16 flex items-start">
          <div className="w-full grid lg:grid-cols-2 gap-12 lg:gap-10 items-start">
            <div className="relative text-center lg:text-left min-h-[260px] lg:pt-24">
              {/* Title — fades out when the user opens the file-city explanation. */}
              <div
                className={`transition-opacity duration-700 ${view === 'title' && !fading ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                aria-hidden={view !== 'title' || fading}
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
                    onClick={() => goToView('fileCity')}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md text-base font-medium transition-colors hover:opacity-80"
                    style={{
                      background: `color-mix(in srgb, ${theme.colors.primary} 18%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${theme.colors.primary} 50%, transparent)`,
                      color: theme.colors.primary,
                    }}
                  >
                    It starts with a File City
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
                  @keyframes typingCaret {
                    0%, 49% { opacity: 1; }
                    50%, 100% { opacity: 0; }
                  }
                  .typing-caret {
                    display: inline-block;
                    margin-left: 1px;
                    animation: typingCaret 0.9s steps(1, end) infinite;
                  }
                `}</style>
              </div>

              {/* File-city explanation. */}
              <div
                className={`absolute inset-x-0 bottom-0 top-32 transition-opacity duration-700 ${view === 'fileCity' && !fading ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                aria-hidden={view !== 'fileCity' || fading}
              >
                <div className="flex items-start justify-between gap-4 mb-4">
                  <h2
                    className="text-3xl md:text-4xl font-semibold tracking-tight"
                    style={{ color: theme.colors.primary }}
                  >
                    What&rsquo;s a File City?
                  </h2>
                  <button
                    onClick={() => goToView('title')}
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
                  {(() => {
                    const firstLineLength = FILE_CITY_BLURB_LINE_1.length;
                    const firstShown = FILE_CITY_BLURB_LINE_1.slice(
                      0,
                      Math.min(fileCityTyped, firstLineLength),
                    );
                    const secondShown = FILE_CITY_BLURB_LINE_2.slice(
                      0,
                      Math.max(0, fileCityTyped - firstLineLength),
                    );
                    const onSecondLine = fileCityTyped > firstLineLength;
                    const caret = (
                      <span
                        className="typing-caret"
                        style={{ color: theme.colors.primary }}
                        aria-hidden="true"
                      >
                        ▍
                      </span>
                    );
                    return (
                      <>
                        <p>
                          {firstShown}
                          {!fileCityTypingDone && !onSecondLine && caret}
                        </p>
                        {onSecondLine && (
                          <p className="mt-2">
                            {secondShown}
                            {!fileCityTypingDone && caret}
                          </p>
                        )}
                      </>
                    );
                  })()}
                </div>
                <div
                  className="transition-opacity duration-500 delay-[1800ms]"
                  style={{
                    opacity: fileCityTypingDone ? 1 : 0,
                    pointerEvents: fileCityTypingDone ? 'auto' : 'none',
                  }}
                  aria-hidden={!fileCityTypingDone}
                >
                  <button
                    type="button"
                    onClick={() => goToView('codeTrail')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-opacity hover:opacity-80"
                    style={{
                      background: `color-mix(in srgb, ${theme.colors.primary} 18%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${theme.colors.primary} 50%, transparent)`,
                      color: theme.colors.primary,
                    }}
                    tabIndex={fileCityTypingDone ? 0 : -1}
                  >
                    What is a Code Trail?
                  </button>
                </div>
              </div>

              {/* Code-trail explanation. */}
              <div
                className={`absolute inset-x-0 bottom-0 top-32 transition-opacity duration-700 ${view === 'codeTrail' && !fading ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                aria-hidden={view !== 'codeTrail' || fading}
              >
                <div className="flex items-start justify-between gap-4 mb-4">
                  <h2
                    className="text-3xl md:text-4xl font-semibold tracking-tight"
                    style={{ color: theme.colors.primary }}
                  >
                    What is a Code Trail?
                  </h2>
                  <button
                    onClick={() => goToView('title')}
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
                    {CODE_TRAIL_BLURB.slice(0, codeTrailTyped)}
                    {!codeTrailTypingDone && (
                      <span
                        className="typing-caret"
                        style={{ color: theme.colors.primary }}
                        aria-hidden="true"
                      >
                        ▍
                      </span>
                    )}
                  </p>
                </div>
                <div
                  className="transition-opacity duration-500 delay-[1800ms]"
                  style={{
                    opacity: codeTrailTypingDone ? 1 : 0,
                    pointerEvents: codeTrailTypingDone ? 'auto' : 'none',
                  }}
                  aria-hidden={!codeTrailTypingDone}
                >
                  <button
                    type="button"
                    onClick={() => goToView(stamp ? 'stamped' : 'whyTrails')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-opacity hover:opacity-80"
                    style={{
                      background: `color-mix(in srgb, ${theme.colors.primary} 18%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${theme.colors.primary} 50%, transparent)`,
                      color: theme.colors.primary,
                    }}
                    tabIndex={codeTrailTypingDone ? 0 : -1}
                  >
                    Why do I need Code Trails?
                  </button>
                </div>
              </div>

              {/* Why-trails / Mark Twain quote — sign-off step. */}
              <div
                className={`absolute inset-x-0 bottom-0 top-32 transition-opacity duration-700 ${view === 'whyTrails' && !fading ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                aria-hidden={view !== 'whyTrails' || fading}
              >
                <div className="flex items-start justify-between gap-4 mb-4">
                  <h2
                    className="text-3xl md:text-4xl font-semibold tracking-tight"
                    style={{ color: theme.colors.primary }}
                  >
                    Why do I need Code Trails?
                  </h2>
                  <button
                    onClick={() => goToView('title')}
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
                  <p className="mb-3">
                    {WHY_LINE_1.slice(0, Math.min(whyTyped, WHY_LINE_1_END))}
                    {whyTyped <= WHY_LINE_1_END && !whyTypingDone && (
                      <span
                        className="typing-caret"
                        style={{ color: theme.colors.primary }}
                        aria-hidden="true"
                      >
                        ▍
                      </span>
                    )}
                  </p>
                  {whyTyped > WHY_LINE_1_END && (
                    <p style={{ color: theme.colors.primary }}>
                      {WHY_LINE_2.slice(
                        0,
                        Math.min(
                          whyTyped - WHY_LINE_1_END,
                          WHY_LINE_2.length,
                        ),
                      )}
                      {whyTyped <= WHY_LINE_2_END && !whyTypingDone && (
                        <span
                          className="typing-caret"
                          style={{ color: theme.colors.primary }}
                          aria-hidden="true"
                        >
                          ▍
                        </span>
                      )}
                    </p>
                  )}
                  {whyTyped > WHY_LINE_2_END && (
                    <p className="mt-3">
                      {WHY_LINE_3.slice(
                        0,
                        Math.max(0, whyTyped - WHY_LINE_2_END),
                      )}
                      {!whyTypingDone && (
                        <span
                          className="typing-caret"
                          style={{ color: theme.colors.primary }}
                          aria-hidden="true"
                        >
                          ▍
                        </span>
                      )}
                    </p>
                  )}
                </div>
                <p
                  className="text-sm md:text-base mb-3 transition-opacity duration-500 delay-700"
                  style={{
                    color: theme.colors.textMuted,
                    opacity: whyTypingDone ? 1 : 0,
                  }}
                  aria-hidden={!whyTypingDone}
                >
                  Sign off on this trail to continue.
                </p>
                <div
                  className="flex flex-col sm:flex-row sm:items-center gap-3 text-base transition-opacity duration-500 delay-700"
                  style={{
                    opacity: whyTypingDone ? 1 : 0,
                    pointerEvents: whyTypingDone ? 'auto' : 'none',
                  }}
                  aria-hidden={!whyTypingDone}
                >
                  <button
                    type="button"
                    onClick={() => handleStamp('LGTM')}
                    disabled={stampAnimating || stamp !== null || !whyTypingDone}
                    tabIndex={whyTypingDone ? 0 : -1}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-md font-mono font-semibold tracking-wider transition-opacity hover:opacity-80 disabled:opacity-60 disabled:cursor-not-allowed"
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
                    disabled={stampAnimating || stamp !== null || !whyTypingDone}
                    tabIndex={whyTypingDone ? 0 : -1}
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
                className={`absolute inset-x-0 bottom-0 top-32 transition-opacity duration-700 ${view === 'stamped' && !fading ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                aria-hidden={view !== 'stamped' || fading}
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
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md font-medium transition-opacity hover:opacity-80"
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
                  goToView(view === 'fileCity' ? 'title' : 'fileCity');
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
                    highlightTrail={codeTrailRevealed}
                    hideTrail={view === 'title' || view === 'fileCity'}
                    trailVisible={view !== 'codeTrail' || codeTrailRevealed}
                    hideSnippet={view === 'title'}
                    snippetVisible={view !== 'fileCity' || fileCityTypingDone}
                    stampRowVisible={
                      (view === 'whyTrails' && whyTypingDone) || view === 'stamped'
                    }
                    userStamped={stamp !== null}
                  />
                </div>
              </button>

              {/* Sign-off stamp lands on the empty placeholder slot in
                  the stamp row, so the visitor's signature visibly joins
                  the team's prior approvals. */}
              {stampAnimating && stamp && (
                <SignOffStampAnimation
                  theme={theme}
                  text="ME"
                  subtitle={stamp}
                  ink={
                    stamp === 'ACK' ? '#d1d8e0' : theme.colors.success
                  }
                  size={72}
                  left="84%"
                  top="45%"
                />
              )}

              {!stampAnimating && stamp && (
                <div
                  aria-hidden
                  className={`absolute pointer-events-none transition-opacity duration-700 ease-out ${
                    diagramRevealed ? 'opacity-100' : 'opacity-0'
                  }`}
                  style={{
                    left: '84%',
                    top: '45%',
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <style>{`
                    @keyframes stamp-settle {
                      0%   { transform: rotate(-8deg) scale(1.6); opacity: 0; }
                      100% { transform: rotate(-8deg) scale(1); opacity: 1; }
                    }
                  `}</style>
                  <div
                    style={{
                      transform: 'rotate(-8deg)',
                      animation: 'stamp-settle 320ms ease-out both',
                    }}
                  >
                    <LgtmStamp
                      theme={theme}
                      size={72}
                      rotated={false}
                      text="ME"
                      subtitle={stamp ?? 'LGTM'}
                      ink={
                        stamp === 'ACK' ? '#d1d8e0' : theme.colors.success
                      }
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
        )}

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

// ============================================================================
// Signed-in dashboard
// ============================================================================

type ThemeShape = ReturnType<typeof useTheme>['theme'];

interface SkillLink {
  name: string;
  blurb: string;
  url: string;
}

const SKILL_URL = (name: string) =>
  `https://github.com/principal-ai/skills/blob/main/${name}/SKILL.md`;

// Skills that POST to the running desktop app's MCP Bridge.
const SKILLS_WITH_APP: SkillLink[] = [
  {
    name: 'author-informative-trail',
    blurb: 'Author a durable, canonical trail in the File City panel.',
    url: SKILL_URL('author-informative-trail'),
  },
  {
    name: 'author-investigation-trail',
    blurb: 'Lay an exploratory trail as you figure something out.',
    url: SKILL_URL('author-investigation-trail'),
  },
];

// Skills that run via the `principal-ai` CLI — no desktop app required.
const SKILLS_WITHOUT_APP: SkillLink[] = [
  {
    name: 'author-local-informative-trail',
    blurb: 'Author a canonical trail and view it in the standalone viewer.',
    url: SKILL_URL('author-local-informative-trail'),
  },
  {
    name: 'author-local-investigation-trail',
    blurb: 'Lay an exploratory trail locally — no publish, no app.',
    url: SKILL_URL('author-local-investigation-trail'),
  },
  {
    name: 'create-topic',
    blurb: 'Curate existing trails into a shareable topic.',
    url: SKILL_URL('create-topic'),
  },
];

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diffMs = Date.now() - then;
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yr = Math.round(mo / 12);
  return `${yr}y ago`;
}

function SignedInDashboard({
  user,
  theme,
}: {
  user: User;
  theme: ThemeShape;
}) {
  const [trails, setTrails] = useState<TrailByUserEntry[] | null>(null);
  const [topics, setTopics] = useState<TopicByUserEntry[] | null>(null);
  const [trailsError, setTrailsError] = useState<string | null>(null);
  const [topicsError, setTopicsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTrails(null);
    setTrailsError(null);
    fetch(`/api/trails/by-user/${user.id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { entries: TrailByUserEntry[] }) => {
        if (!cancelled) setTrails(data.entries);
      })
      .catch((e) => {
        if (!cancelled) setTrailsError(String(e?.message ?? e));
      });
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  useEffect(() => {
    let cancelled = false;
    setTopics(null);
    setTopicsError(null);
    fetch(`/api/topics/by-user/${user.id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { entries: TopicByUserEntry[] }) => {
        if (!cancelled) setTopics(data.entries);
      })
      .catch((e) => {
        if (!cancelled) setTopicsError(String(e?.message ?? e));
      });
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  const displayName = user.name || user.login;

  return (
    <section className="flex-1 w-full max-w-7xl mx-auto px-6 py-12">
      {/* Greeting */}
      <div className="flex items-center gap-4 mb-10">
        {user.avatar_url && (
          // Plain <img> intentionally — GitHub avatar URLs are external and the
          // dashboard runs on the client; bypassing next/image avoids the
          // remote-pattern config dance for a 56px image.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatar_url}
            alt={displayName}
            className="w-14 h-14 rounded-full"
            style={{
              border: `1px solid color-mix(in srgb, ${theme.colors.border} 70%, transparent)`,
            }}
          />
        )}
        <div className="min-w-0">
          <div
            className="text-2xl md:text-3xl font-semibold tracking-tight"
            style={{ color: theme.colors.text }}
          >
            Welcome back, {displayName}.
          </div>
          <div className="text-sm" style={{ color: theme.colors.textMuted }}>
            @{user.login}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent trails */}
        <DashCard
          theme={theme}
          icon={<Footprints size={18} color={theme.colors.primary} />}
          title="Recent trails"
          subtitle="Trails you've published"
        >
          <TrailList
            trails={trails}
            error={trailsError}
            theme={theme}
          />
        </DashCard>

        {/* Your topics */}
        <DashCard
          theme={theme}
          icon={<Folder size={18} color={theme.colors.primary} />}
          title="Your topics"
          subtitle="Curated collections of trails"
          action={
            <Link
              href="/topic/new"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-opacity hover:opacity-80"
              style={{
                background: theme.colors.primary,
                color: theme.colors.background,
              }}
            >
              <Plus size={14} />
              New topic
            </Link>
          }
        >
          <TopicList topics={topics} error={topicsError} theme={theme} />
        </DashCard>

        {/* Skills — grouped by whether they need the Principal AI desktop app. */}
        <DashCard
          theme={theme}
          icon={<Sparkles size={18} color={theme.colors.primary} />}
          title="Skills"
          subtitle="Agent skills you can hand off to your editor"
          className="lg:col-span-2"
        >
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
            <SkillGroup
              theme={theme}
              heading="With app"
              caption="Runs against the desktop app's File City panel"
              skills={SKILLS_WITH_APP}
            />
            <SkillGroup
              theme={theme}
              heading="Without app"
              caption="Runs from your terminal via the principal-ai CLI"
              skills={SKILLS_WITHOUT_APP}
            />
          </div>
        </DashCard>
      </div>
    </section>
  );
}

function DashCard({
  theme,
  icon,
  title,
  subtitle,
  action,
  className,
  children,
}: {
  theme: ThemeShape;
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl p-5 backdrop-blur-xl ${className ?? ''}`}
      style={{
        background: `color-mix(in srgb, ${theme.colors.surface} 60%, transparent)`,
        border: `1px solid color-mix(in srgb, ${theme.colors.border} 50%, transparent)`,
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-2 min-w-0">
          {icon && <span className="mt-0.5">{icon}</span>}
          <div className="min-w-0">
            <h2
              className="text-lg font-semibold tracking-tight"
              style={{ color: theme.colors.text }}
            >
              {title}
            </h2>
            {subtitle && (
              <p
                className="text-xs"
                style={{ color: theme.colors.textMuted }}
              >
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function SkillGroup({
  theme,
  heading,
  caption,
  skills,
}: {
  theme: ThemeShape;
  heading: string;
  caption: string;
  skills: SkillLink[];
}) {
  return (
    <div className="min-w-0">
      <div className="mb-2">
        <div
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: theme.colors.primary }}
        >
          {heading}
        </div>
        <div
          className="text-xs"
          style={{ color: theme.colors.textMuted }}
        >
          {caption}
        </div>
      </div>
      <ul className="flex flex-col gap-1.5">
        {skills.map((s) => (
          <li key={s.name}>
            <a
              href={s.url}
              target="_blank"
              rel="noreferrer"
              className="block rounded-md px-3 py-2 transition-colors hover:opacity-80"
              style={{
                background: `color-mix(in srgb, ${theme.colors.background} 50%, transparent)`,
                border: `1px solid color-mix(in srgb, ${theme.colors.border} 40%, transparent)`,
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <code
                  className="text-sm font-medium truncate"
                  style={{ color: theme.colors.text }}
                >
                  {s.name}
                </code>
                <ExternalLink
                  size={12}
                  style={{ color: theme.colors.textMuted, flexShrink: 0 }}
                />
              </div>
              <div
                className="text-xs mt-0.5 line-clamp-2"
                style={{ color: theme.colors.textMuted }}
              >
                {s.blurb}
              </div>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TrailList({
  trails,
  error,
  theme,
}: {
  trails: TrailByUserEntry[] | null;
  error: string | null;
  theme: ThemeShape;
}) {
  if (error) {
    return (
      <div className="text-sm" style={{ color: theme.colors.textMuted }}>
        Couldn&rsquo;t load trails: {error}
      </div>
    );
  }
  if (trails === null) {
    return (
      <div className="text-sm" style={{ color: theme.colors.textMuted }}>
        Loading…
      </div>
    );
  }
  if (trails.length === 0) {
    return (
      <div className="text-sm" style={{ color: theme.colors.textMuted }}>
        You haven&rsquo;t published any trails yet. Publish one from the File
        City panel to see it here.
      </div>
    );
  }
  const visible = trails.slice(0, 5);
  return (
    <ul className="flex flex-col gap-2">
      {visible.map((t) => (
        <li key={t.id}>
          <Link
            href={`/trail/${t.id}`}
            className="block rounded-md px-3 py-2 transition-colors hover:opacity-80"
            style={{
              background: `color-mix(in srgb, ${theme.colors.background} 50%, transparent)`,
              border: `1px solid color-mix(in srgb, ${theme.colors.border} 40%, transparent)`,
            }}
          >
            <div
              className="text-sm font-medium truncate"
              style={{ color: theme.colors.text }}
            >
              {t.title}
            </div>
            <div
              className="text-xs flex items-center gap-2 mt-0.5"
              style={{ color: theme.colors.textMuted }}
            >
              <span className="truncate">
                {t.owner}/{t.repo}
              </span>
              <span aria-hidden>·</span>
              <span>{t.markerCount} markers</span>
              <span aria-hidden>·</span>
              <span>{relativeTime(t.updatedAt)}</span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function TopicList({
  topics,
  error,
  theme,
}: {
  topics: TopicByUserEntry[] | null;
  error: string | null;
  theme: ThemeShape;
}) {
  if (error) {
    return (
      <div className="text-sm" style={{ color: theme.colors.textMuted }}>
        Couldn&rsquo;t load topics: {error}
      </div>
    );
  }
  if (topics === null) {
    return (
      <div className="text-sm" style={{ color: theme.colors.textMuted }}>
        Loading…
      </div>
    );
  }
  if (topics.length === 0) {
    return (
      <div className="text-sm" style={{ color: theme.colors.textMuted }}>
        No topics yet. Create one to curate a set of trails on a shared
        subject.
      </div>
    );
  }
  const visible = topics.slice(0, 5);
  return (
    <ul className="flex flex-col gap-2">
      {visible.map((t) => (
        <li key={t.id}>
          <Link
            href={`/topic/${t.id}`}
            className="block rounded-md px-3 py-2 transition-colors hover:opacity-80"
            style={{
              background: `color-mix(in srgb, ${theme.colors.background} 50%, transparent)`,
              border: `1px solid color-mix(in srgb, ${theme.colors.border} 40%, transparent)`,
            }}
          >
            <div
              className="text-sm font-medium truncate"
              style={{ color: theme.colors.text }}
            >
              {t.title}
            </div>
            <div
              className="text-xs flex items-center gap-2 mt-0.5"
              style={{ color: theme.colors.textMuted }}
            >
              <span>{t.trailCount} trails</span>
              <span aria-hidden>·</span>
              <span>{relativeTime(t.updatedAt)}</span>
            </div>
            {t.descriptionPreview && (
              <div
                className="text-xs mt-1 line-clamp-2"
                style={{ color: theme.colors.textMuted }}
              >
                {t.descriptionPreview}
              </div>
            )}
          </Link>
        </li>
      ))}
    </ul>
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
                    className="text-left rounded-lg p-4 transition-opacity hover:opacity-80"
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
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-opacity hover:opacity-80"
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
