'use client';

/**
 * Share dialog for a trail. The trail already lives on web-ade, so unlike
 * the electron-app's TrailShareModal there's no upload step — this is the
 * success-state surface only: copy a human link, open it, or copy the
 * agent CLI command.
 *
 * Two audiences, two sections:
 *   - "With humans": copy the `/trail/<id>` link or open it in a new tab.
 *   - "With agents": copy the `npx … trail <id>` command so an agent can
 *     pull the trail into its own context.
 */

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Share2, X } from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';

const COPY_FEEDBACK_MS = 1500;
// After copying the human link, let the "Link copied" state show briefly,
// then dismiss the modal — the user's done once the link is on the clipboard.
const LINK_COPIED_DISMISS_MS = 900;

// Matches the command shown on the trail page header (TrailHeader.tsx).
const buildAgentCommand = (trailId: string) =>
  `npx -y @principal-ai/principal-view-cli@latest trail ${trailId}`;

type CopiedKind = 'link' | 'agent' | null;

interface TrailShareModalProps {
  trailId: string;
  /** Optional trail title, shown under the modal heading. */
  trailTitle?: string | null;
  onClose: () => void;
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
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
    } finally {
      document.body.removeChild(ta);
    }
  }
}

export function TrailShareModal({
  trailId,
  trailTitle,
  onClose,
}: TrailShareModalProps) {
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState<CopiedKind>(null);

  useEffect(() => setMounted(true), []);

  // window.location is client-only; the mounted guard below defers any
  // read of `url` until after hydration.
  const url = mounted ? `${window.location.origin}/trail/${trailId}` : '';
  const agentCommand = buildAgentCommand(trailId);

  const copy = useCallback(async (text: string, kind: CopiedKind) => {
    await copyText(text);
    setCopied(kind);
  }, []);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), COPY_FEEDBACK_MS);
    return () => clearTimeout(t);
  }, [copied]);

  // Copying the human link is the terminal action, so close the modal after
  // a brief pause once "Link copied" is showing.
  useEffect(() => {
    if (copied !== 'link') return;
    const t = setTimeout(onClose, LINK_COPIED_DISMISS_MS);
    return () => clearTimeout(t);
  }, [copied, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!mounted) return null;

  const copiedLink = copied === 'link';
  const copiedAgent = copied === 'agent';

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Share trail"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{
        background: 'rgba(0,0,0,0.55)',
        paddingTop: 'var(--safe-top)',
        zIndex: 2147483000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{
          background: theme.colors.surface,
          border: `1px solid ${theme.colors.border}`,
          color: theme.colors.text,
          fontFamily: theme.fonts.body,
          maxHeight: '85vh',
        }}
      >
        <div
          className="flex items-center gap-3 px-4 py-3 border-b"
          style={{ borderColor: theme.colors.border }}
        >
          <Share2 className="w-4 h-4 flex-shrink-0" style={{ color: theme.colors.primary }} />
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold truncate">Share trail</div>
            {trailTitle && (
              <div
                className="text-xs truncate"
                style={{ color: theme.colors.textMuted }}
              >
                {trailTitle}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-md flex items-center justify-center transition-opacity hover:opacity-80"
            style={{
              background: 'transparent',
              color: theme.colors.text,
              border: `1px solid ${theme.colors.border}`,
              cursor: 'pointer',
            }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-4 flex flex-col gap-4">
          <section className="flex flex-col gap-2">
            <SectionLabel color={theme.colors.textMuted}>With humans</SectionLabel>
            <ActionButton
              theme={theme}
              onClick={() => copy(url, 'link')}
              active={copiedLink}
              title={url}
              full
            >
              {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copiedLink ? 'Link copied' : 'Copy link'}</span>
            </ActionButton>
          </section>

          <section className="flex flex-col gap-2">
            <SectionLabel color={theme.colors.textMuted}>With agents</SectionLabel>
            <ActionButton
              theme={theme}
              onClick={() => copy(agentCommand, 'agent')}
              active={copiedAgent}
              title={agentCommand}
              full
            >
              {copiedAgent ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copiedAgent ? 'Command copied' : 'Copy for agents'}</span>
            </ActionButton>
            <pre
              className="overflow-auto text-xs font-mono whitespace-pre m-0"
              style={{
                color: theme.colors.textMuted,
                background: theme.colors.background,
                padding: '0.625rem 0.75rem',
                borderRadius: '0.375rem',
                border: `1px solid ${theme.colors.border}`,
              }}
            >
              {agentCommand}
            </pre>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function SectionLabel({
  children,
  color,
}: {
  children: React.ReactNode;
  color: string;
}) {
  return (
    <span
      className="text-xs font-medium uppercase tracking-wide"
      style={{ color }}
    >
      {children}
    </span>
  );
}

function ActionButton({
  theme,
  onClick,
  active,
  title,
  full,
  children,
}: {
  theme: ReturnType<typeof useTheme>['theme'];
  onClick: () => void;
  active?: boolean;
  title?: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`inline-flex items-center justify-center gap-1.5 px-3 h-9 rounded-md text-sm font-medium transition-opacity hover:opacity-80 ${full ? 'w-full' : ''}`}
      style={{
        background: active ? theme.colors.primary : 'transparent',
        color: active ? theme.colors.background : theme.colors.text,
        border: `1px solid ${active ? theme.colors.primary : theme.colors.border}`,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
