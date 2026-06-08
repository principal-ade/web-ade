'use client';

import { useEffect, useState } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { Check, Copy, Download, ExternalLink, X } from 'lucide-react';

const DOWNLOAD_URL = 'https://principal-ade.com/download';

/** The one skill we surface here: author a trail locally, no account, no publish. */
const LOCAL_TRAIL_SKILL = {
  skillUrl:
    'https://github.com/principal-ai/skills/blob/main/author-local-investigation-trail/SKILL.md',
  prompt: `Read the author-local-investigation-trail skill at https://github.com/principal-ai/skills/blob/main/author-local-investigation-trail/SKILL.md and use it to walk me through <topic> locally as an investigation trail.`,
};

/**
 * The single, shared "Create your own trail" modal — used by both the signed-out
 * landing page and the signed-in dashboard. Two paths only: author a trail
 * locally with the agent skill, or download the desktop app for the full
 * experience.
 */
export function CreateTrailModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const [copied, setCopied] = useState(false);

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
    if (!open) setCopied(false);
  }, [open]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(LOCAL_TRAIL_SKILL.prompt);
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
            Create your own trail
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

        <p
          className="text-sm md:text-base leading-relaxed mb-4"
          style={{ color: theme.colors.text }}
        >
          Drop this prompt into your agent.
        </p>

        <div
          className="rounded-lg p-4 mb-4 font-mono text-sm leading-relaxed whitespace-pre-wrap"
          style={{
            background: `color-mix(in srgb, ${theme.colors.background} 70%, transparent)`,
            border: `1px solid color-mix(in srgb, ${theme.colors.border} 60%, transparent)`,
            color: theme.colors.text,
          }}
        >
          {LOCAL_TRAIL_SKILL.prompt}
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
            href={LOCAL_TRAIL_SKILL.skillUrl}
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
        </div>

        {/* Or get the full experience in the desktop app. */}
        <div
          className="flex items-center gap-3 my-5"
          aria-hidden
        >
          <div
            className="h-px flex-1"
            style={{ background: `color-mix(in srgb, ${theme.colors.border} 60%, transparent)` }}
          />
          <span
            className="text-xs uppercase tracking-wide"
            style={{ color: theme.colors.textMuted }}
          >
            or
          </span>
          <div
            className="h-px flex-1"
            style={{ background: `color-mix(in srgb, ${theme.colors.border} 60%, transparent)` }}
          />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p
            className="text-sm leading-relaxed"
            style={{ color: theme.colors.text }}
          >
            Get the desktop app for the full File City experience.
          </p>
          <a
            href={DOWNLOAD_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-opacity hover:opacity-80 flex-shrink-0"
            style={{
              background: theme.colors.primary,
              color: theme.colors.background,
            }}
          >
            <Download size={16} />
            Download the app
          </a>
        </div>
      </div>
    </div>
  );
}
