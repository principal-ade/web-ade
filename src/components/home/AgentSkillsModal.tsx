'use client';

import { useEffect, useState } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import {
  ArrowLeft,
  Check,
  Compass,
  Copy,
  ExternalLink,
  Folder,
  Footprints,
  ListChecks,
  Search,
  Sparkles,
  Terminal,
  X,
} from 'lucide-react';

type ThemeShape = ReturnType<typeof useTheme>['theme'];

type Intent = 'canonical' | 'investigation' | 'topic' | 'discover';
type Env = 'app' | 'cli';
type Step = 'intent' | 'env' | 'result' | 'all';

interface SkillEntry {
  name: string;
  url: string;
  blurb: string;
  /** Prompt template; `<topic>` left as a placeholder for the user to fill in. */
  prompt: string;
}

const SKILL_URL = (name: string) =>
  `https://github.com/principal-ai/skills/blob/main/${name}/SKILL.md`;

const SKILLS: Record<string, SkillEntry> = {
  'author-informative-trail': {
    name: 'author-informative-trail',
    url: SKILL_URL('author-informative-trail'),
    blurb: 'Author a durable, canonical trail in the File City panel.',
    prompt:
      'Read the author-informative-trail skill at ' +
      SKILL_URL('author-informative-trail') +
      ' and use it to lay a canonical trail through <topic>.',
  },
  'author-investigation-trail': {
    name: 'author-investigation-trail',
    url: SKILL_URL('author-investigation-trail'),
    blurb: 'Lay an exploratory trail as you figure something out.',
    prompt:
      'Read the author-investigation-trail skill at ' +
      SKILL_URL('author-investigation-trail') +
      ' and use it to investigate <topic> and lay an investigation trail as you go.',
  },
  'author-local-informative-trail': {
    name: 'author-local-informative-trail',
    url: SKILL_URL('author-local-informative-trail'),
    blurb: 'Author a canonical trail and view it in the standalone viewer.',
    prompt:
      'Read the author-local-informative-trail skill at ' +
      SKILL_URL('author-local-informative-trail') +
      ' and use it to lay a canonical local trail through <topic>.',
  },
  'author-local-investigation-trail': {
    name: 'author-local-investigation-trail',
    url: SKILL_URL('author-local-investigation-trail'),
    blurb: 'Lay an exploratory trail locally — no publish, no app.',
    prompt:
      'Read the author-local-investigation-trail skill at ' +
      SKILL_URL('author-local-investigation-trail') +
      ' and use it to investigate <topic> locally as an investigation trail.',
  },
  'create-topic': {
    name: 'create-topic',
    url: SKILL_URL('create-topic'),
    blurb: 'Curate existing trails into a shareable topic.',
    prompt:
      'Read the create-topic skill at ' +
      SKILL_URL('create-topic') +
      ' and use it to curate my published trails into a topic about <subject>.',
  },
  'discover-trails': {
    name: 'discover-trails',
    url: SKILL_URL('discover-trails'),
    blurb: 'Browse trails and topics already on web-ade — list, fetch, summarize.',
    prompt:
      'Read the discover-trails skill at ' +
      SKILL_URL('discover-trails') +
      ' and use it to find trails on web-ade about <topic> and summarize what they cover.',
  },
};

function resolveSkill(intent: Intent, env: Env | null): SkillEntry {
  switch (intent) {
    case 'canonical':
      return env === 'app'
        ? SKILLS['author-informative-trail']!
        : SKILLS['author-local-informative-trail']!;
    case 'investigation':
      return env === 'app'
        ? SKILLS['author-investigation-trail']!
        : SKILLS['author-local-investigation-trail']!;
    case 'topic':
      return SKILLS['create-topic']!;
    case 'discover':
      return SKILLS['discover-trails']!;
  }
}

/** Intent picker — leaf intents (topic, discover) skip the env step. */
const INTENT_OPTIONS: {
  key: Intent;
  label: string;
  blurb: string;
  needsEnv: boolean;
  Icon: typeof Footprints;
}[] = [
  {
    key: 'canonical',
    label: 'Author a canonical trail',
    blurb: 'State what is true about a flow or insight — the durable version.',
    needsEnv: true,
    Icon: Footprints,
  },
  {
    key: 'investigation',
    label: 'Lay an investigation trail',
    blurb: 'Explore as you go — exploratory titles, subject markers, room to wander.',
    needsEnv: true,
    Icon: Compass,
  },
  {
    key: 'topic',
    label: 'Curate a topic',
    blurb: 'Collect your existing trails on a shared subject into one page.',
    needsEnv: false,
    Icon: Folder,
  },
  {
    key: 'discover',
    label: 'Discover trails',
    blurb: 'Browse what is already on web-ade — list, fetch, summarize.',
    needsEnv: false,
    Icon: Search,
  },
];

const ENV_OPTIONS: { key: Env; label: string; blurb: string; Icon: typeof Sparkles }[] = [
  {
    key: 'app',
    label: 'Desktop app open',
    blurb: 'Trail POSTs directly into your running File City panel.',
    Icon: Sparkles,
  },
  {
    key: 'cli',
    label: 'CLI only',
    blurb: 'Run from your terminal — no desktop app required.',
    Icon: Terminal,
  },
];

export function AgentSkillsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const [step, setStep] = useState<Step>('intent');
  const [intent, setIntent] = useState<Intent | null>(null);
  const [env, setEnv] = useState<Env | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Reset state every time the modal closes so the next open starts fresh.
  useEffect(() => {
    if (!open) {
      setStep('intent');
      setIntent(null);
      setEnv(null);
      setCopied(false);
    }
  }, [open]);

  if (!open) return null;

  const skill = intent ? resolveSkill(intent, env) : null;

  const handlePickIntent = (i: Intent) => {
    setIntent(i);
    const needsEnv = INTENT_OPTIONS.find((o) => o.key === i)!.needsEnv;
    setStep(needsEnv ? 'env' : 'result');
  };

  const handlePickEnv = (e: Env) => {
    setEnv(e);
    setStep('result');
  };

  const handleCopy = async () => {
    if (!skill) return;
    try {
      await navigator.clipboard.writeText(skill.prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be denied — user can select and copy manually.
    }
  };

  const handleBack = () => {
    if (step === 'result') {
      const needsEnv = intent
        ? INTENT_OPTIONS.find((o) => o.key === intent)!.needsEnv
        : false;
      setStep(needsEnv ? 'env' : 'intent');
      setEnv(null);
    } else if (step === 'env') {
      setStep('intent');
      setIntent(null);
    } else if (step === 'all') {
      setStep('intent');
    }
  };

  const title =
    step === 'all'
      ? 'All agent skills'
      : step === 'result' && skill
        ? skill.name
        : step === 'env'
          ? 'Where are you running this?'
          : 'What do you want to do?';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Agent skills picker"
    >
      <div
        className="absolute inset-0 backdrop-blur-md"
        style={{
          background: `color-mix(in srgb, ${theme.colors.background} 70%, transparent)`,
        }}
      />

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
          <div className="flex items-center gap-2 min-w-0">
            {step !== 'intent' && (
              <button
                type="button"
                onClick={handleBack}
                className="rounded-md p-1 transition-colors hover:opacity-80"
                style={{ color: theme.colors.textMuted }}
                aria-label="Back"
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <h3
              className="tracking-tight truncate"
              style={{
                color: theme.colors.primary,
                fontSize: `${theme.fontSizes[5]}px`,
                fontWeight: theme.fontWeights.semibold,
              }}
            >
              {title}
            </h3>
          </div>
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

        {step === 'intent' && (
          <IntentPicker theme={theme} onPick={handlePickIntent} onShowAll={() => setStep('all')} />
        )}
        {step === 'env' && (
          <EnvPicker theme={theme} onPick={handlePickEnv} />
        )}
        {step === 'result' && skill && (
          <ResultPanel
            theme={theme}
            skill={skill}
            copied={copied}
            onCopy={handleCopy}
          />
        )}
        {step === 'all' && (
          <AllSkillsList theme={theme} />
        )}
      </div>
    </div>
  );
}

function IntentPicker({
  theme,
  onPick,
  onShowAll,
}: {
  theme: ThemeShape;
  onPick: (i: Intent) => void;
  onShowAll: () => void;
}) {
  return (
    <>
      <div className="flex flex-col gap-3">
        {INTENT_OPTIONS.map((opt) => {
          const Icon = opt.Icon;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => onPick(opt.key)}
              className="text-left rounded-lg p-4 transition-opacity hover:opacity-80"
              style={{
                background: `color-mix(in srgb, ${theme.colors.primary} 12%, transparent)`,
                border: `1px solid color-mix(in srgb, ${theme.colors.primary} 45%, transparent)`,
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon size={16} color={theme.colors.primary} />
                <div
                  style={{
                    color: theme.colors.primary,
                    fontSize: `${theme.fontSizes[2]}px`,
                    fontWeight: theme.fontWeights.semibold,
                  }}
                >
                  {opt.label}
                </div>
              </div>
              <div
                style={{
                  color: theme.colors.text,
                  fontSize: `${theme.fontSizes[1]}px`,
                }}
              >
                {opt.blurb}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onShowAll}
          className="inline-flex items-center gap-1.5 transition-opacity hover:opacity-80"
          style={{
            color: theme.colors.textMuted,
            fontSize: `${theme.fontSizes[1]}px`,
          }}
        >
          <ListChecks size={14} />
          Show all skills
        </button>
      </div>
    </>
  );
}

function EnvPicker({
  theme,
  onPick,
}: {
  theme: ThemeShape;
  onPick: (e: Env) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {ENV_OPTIONS.map((opt) => {
        const Icon = opt.Icon;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onPick(opt.key)}
            className="text-left rounded-lg p-4 transition-opacity hover:opacity-80"
            style={{
              background: `color-mix(in srgb, ${theme.colors.primary} 12%, transparent)`,
              border: `1px solid color-mix(in srgb, ${theme.colors.primary} 45%, transparent)`,
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <Icon size={16} color={theme.colors.primary} />
              <div
                style={{
                  color: theme.colors.primary,
                  fontSize: `${theme.fontSizes[2]}px`,
                  fontWeight: theme.fontWeights.semibold,
                }}
              >
                {opt.label}
              </div>
            </div>
            <div
              style={{
                color: theme.colors.text,
                fontSize: `${theme.fontSizes[1]}px`,
              }}
            >
              {opt.blurb}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ResultPanel({
  theme,
  skill,
  copied,
  onCopy,
}: {
  theme: ThemeShape;
  skill: SkillEntry;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <>
      <p
        className="mb-4"
        style={{
          color: theme.colors.text,
          fontSize: `${theme.fontSizes[2]}px`,
        }}
      >
        {skill.blurb} Drop this prompt into your agent — replace{' '}
        <code style={{ color: theme.colors.primary }}>&lt;topic&gt;</code> with the
        flow you care about.
      </p>

      <div
        className="rounded-lg p-4 mb-4 font-mono whitespace-pre-wrap"
        style={{
          background: `color-mix(in srgb, ${theme.colors.background} 70%, transparent)`,
          border: `1px solid color-mix(in srgb, ${theme.colors.border} 60%, transparent)`,
          color: theme.colors.text,
          fontSize: `${theme.fontSizes[1]}px`,
          lineHeight: 1.5,
        }}
      >
        {skill.prompt}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md transition-opacity hover:opacity-80"
          style={{
            background: theme.colors.primary,
            color: theme.colors.background,
            fontSize: `${theme.fontSizes[1]}px`,
            fontWeight: theme.fontWeights.medium,
          }}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? 'Copied' : 'Copy prompt'}
        </button>
        <a
          href={skill.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md transition-colors hover:opacity-80"
          style={{
            background: `color-mix(in srgb, ${theme.colors.primary} 18%, transparent)`,
            border: `1px solid color-mix(in srgb, ${theme.colors.primary} 50%, transparent)`,
            color: theme.colors.primary,
            fontSize: `${theme.fontSizes[1]}px`,
            fontWeight: theme.fontWeights.medium,
          }}
        >
          <ExternalLink size={14} />
          View skill
        </a>
      </div>
    </>
  );
}

function AllSkillsList({ theme }: { theme: ThemeShape }) {
  return (
    <ul className="flex flex-col gap-2">
      {Object.values(SKILLS).map((s) => (
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
                className="truncate"
                style={{
                  color: theme.colors.text,
                  fontSize: `${theme.fontSizes[2]}px`,
                  fontWeight: theme.fontWeights.medium,
                }}
              >
                {s.name}
              </code>
              <ExternalLink
                size={14}
                style={{ color: theme.colors.textMuted, flexShrink: 0 }}
              />
            </div>
            <div
              className="mt-0.5 line-clamp-2"
              style={{
                color: theme.colors.textMuted,
                fontSize: `${theme.fontSizes[1]}px`,
              }}
            >
              {s.blurb}
            </div>
          </a>
        </li>
      ))}
    </ul>
  );
}
