'use client';

/**
 * Modal that exposes copy-pasteable payloads for two distinct purposes:
 *
 *   1. Suggesting a trail (agent-assisted authoring + the suggest CLI).
 *      The user pastes this into an AI agent in their own repo; the agent
 *      authors a trail that fits, then runs the included CLI command to
 *      suggest it to the topic owner.
 *
 *   2. Briefing an AI agent about this topic for other purposes
 *      (analysis, discussion, referencing). Pure context dump — no
 *      contribution CTA, no CLI command.
 *
 * Both sections render a fixed text block with a copy button; nothing here
 * mutates server state, so the dialog is safe to show to everyone (owners
 * included — owners can still use the inline add-trail input for direct
 * adds, but the agent-brief here is useful regardless).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, Loader2, X } from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';
import type { TopicPayload } from '@/lib/topics/types';
import type { SharedTrailIndexEntry } from '@/lib/trails/types';

export type ContributeMode = 'suggest' | 'brief';

interface TrailFetchResult {
  state: 'loading' | 'ok' | 'error';
  entry?: SharedTrailIndexEntry;
  owner?: string;
  repo?: string;
}

interface SuggestTrailDialogProps {
  topic: TopicPayload;
  trailResults: Record<string, TrailFetchResult>;
  /**
   * `null` keeps the dialog closed. A non-null mode opens the dialog with
   * the matching content — the entry point lives on the page header (one
   * button per mode) so the modal itself doesn't carry a mode switcher.
   */
  mode: ContributeMode | null;
  onClose: () => void;
}

const COPY_FEEDBACK_MS = 1500;
const APP_ORIGIN = 'https://app.principal-ade.com';
const SKILLS_REPO_URL = 'https://github.com/principal-ai/skills';
const CLI_PACKAGE = '@principal-ai/principal-view-cli';

export function SuggestTrailDialog({
  topic,
  trailResults,
  mode,
  onClose,
}: SuggestTrailDialogProps) {
  const { theme } = useTheme();
  const [copied, setCopied] = useState<ContributeMode | null>(null);
  const isOpen = mode !== null;

  // Build a stable text representation of the trail list. Falls back to the
  // bare URL for any trail whose summary hasn't loaded yet — losing the
  // title is better than blocking the copy on a slow fetch.
  const trailLines = useMemo(
    () =>
      topic.trailIds.map((tid) => {
        const result = trailResults[tid];
        const url = `${APP_ORIGIN}/trail/${tid}`;
        if (result?.state === 'ok' && result.entry?.title) {
          return `  - ${result.entry.title} — ${url}`;
        }
        return `  - ${url}`;
      }),
    [topic.trailIds, trailResults],
  );

  const anyTrailLoading = useMemo(
    () =>
      topic.trailIds.some((tid) => {
        const r = trailResults[tid];
        return !r || r.state === 'loading';
      }),
    [topic.trailIds, trailResults],
  );

  const suggestPayload = useMemo(
    () =>
      [
        `I'd like to suggest a trail for this Principal AI topic.`,
        ``,
        `Topic`,
        `  Title: ${topic.title}`,
        `  URL: ${APP_ORIGIN}/topic/${topic.id}`,
        topic.description ? `  Description: ${topic.description}` : null,
        ``,
        `To contribute:`,
        `1. Identify or author a trail in this repo that fits the topic's subject.`,
        `   Use /author-informative-trail (or /author-investigation-trail for`,
        `   exploratory work) to lay one down. If you don't have these skills,`,
        `   get them from ${SKILLS_REPO_URL}.`,
        `2. Once published, suggest it to the topic owner:`,
        ``,
        `   principal-ai topic suggest \\`,
        `     ${APP_ORIGIN}/topic/${topic.id} \\`,
        `     <trail-url> \\`,
        `     --reason "<one line why this trail fits>"`,
        ``,
        `Install the CLI if needed:`,
        `  npm i -g ${CLI_PACKAGE}`,
      ]
        .filter((line): line is string => line !== null)
        .join('\n'),
    [topic.id, topic.title, topic.description],
  );

  const briefPayload = useMemo(
    () =>
      [
        `Context: Principal AI topic.`,
        ``,
        `Title: ${topic.title}`,
        `URL: ${APP_ORIGIN}/topic/${topic.id}`,
        topic.description ? `Description: ${topic.description}` : null,
        ``,
        `Trails in this topic (${topic.trailIds.length}):`,
        ...(topic.trailIds.length === 0 ? ['  (none yet)'] : trailLines),
      ]
        .filter((line): line is string => line !== null)
        .join('\n'),
    [topic.id, topic.title, topic.description, topic.trailIds.length, trailLines],
  );

  const copy = useCallback(
    async (which: 'suggest' | 'brief', text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(which);
      } catch {
        // Clipboard API can fail in insecure contexts. Fall back to a
        // selection-based copy via a hidden textarea.
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand('copy');
          setCopied(which);
        } finally {
          document.body.removeChild(ta);
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), COPY_FEEDBACK_MS);
    return () => clearTimeout(t);
  }, [copied]);

  // Close on Escape — standard modal hygiene.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0, 0, 0, 0.5)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="suggest-dialog-title"
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg border"
        style={{
          background: theme.colors.background,
          borderColor: theme.colors.border,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="flex items-center justify-between gap-4 px-5 py-3 border-b"
          style={{ borderColor: theme.colors.border }}
        >
          <h2
            id="suggest-dialog-title"
            className="text-base font-semibold truncate"
            style={{ color: theme.colors.text }}
          >
            {mode === 'suggest'
              ? 'Contribute a trail'
              : 'Brief your agent about this topic'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:opacity-80 flex-shrink-0"
            style={{
              color: theme.colors.textMuted,
              border: `1px solid ${theme.colors.border}`,
              background: 'transparent',
            }}
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="p-5">
          {mode === 'suggest' ? (
            <TabBody
              description="Paste this into an AI agent (Claude Code, Cursor, etc.) inside the repo you want to contribute from. The agent will help you author a trail that fits this topic, then run the included CLI command to suggest it to the topic owner for review."
              payload={suggestPayload}
              copied={copied === 'suggest'}
              onCopy={() => copy('suggest', suggestPayload)}
            />
          ) : (
            <TabBody
              description="Give your agent context about this topic — title, description, and every trail in it — so it can reference this topic for analysis, discussion, or related work."
              payload={briefPayload}
              copied={copied === 'brief'}
              onCopy={() => copy('brief', briefPayload)}
              loadingHint={anyTrailLoading}
            />
          )}
        </div>
      </div>
    </div>
  );
}

interface TabBodyProps {
  description: string;
  payload: string;
  copied: boolean;
  onCopy: () => void;
  loadingHint?: boolean;
}

function TabBody({
  description,
  payload,
  copied,
  onCopy,
  loadingHint,
}: TabBodyProps) {
  const { theme } = useTheme();
  return (
    <div>
      <p
        className="text-base leading-relaxed"
        style={{ color: theme.colors.text }}
      >
        {description}
      </p>

      {loadingHint && (
        <p
          className="mt-2 text-xs inline-flex items-center gap-1.5"
          style={{ color: theme.colors.textMuted }}
        >
          <Loader2 className="w-3 h-3 animate-spin" />
          Trail titles still loading — URLs are included regardless.
        </p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md text-sm font-medium hover:opacity-80"
          style={{
            background: theme.colors.primary,
            color: theme.colors.background,
            border: `1px solid ${theme.colors.primary}`,
            cursor: 'pointer',
          }}
          aria-label={copied ? 'Copied' : 'Copy prompt'}
        >
          {copied ? (
            <Check className="w-4 h-4" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
          <span>{copied ? 'Copied' : 'Copy prompt'}</span>
        </button>
      </div>

      <pre
        className="mt-3 overflow-auto text-xs font-mono whitespace-pre"
        style={{
          color: theme.colors.text,
          background: theme.colors.background,
          padding: '0.75rem',
          borderRadius: '0.375rem',
          border: `1px solid ${theme.colors.border}`,
          maxHeight: '40vh',
        }}
      >
        {payload}
      </pre>
    </div>
  );
}
