'use client';

/**
 * Modal for suggesting a project (repo) the user thinks deserves trails on
 * this topic. Posts directly to /suggestions with `kind: 'project'` — no
 * CLI hop, since the suggester isn't authoring a trail. The topic owner
 * sees these in the SuggestionsPanel; accept marks the project as
 * in-progress, and matching trails added later auto-resolve the suggestion.
 *
 * Input shape: a single combined `owner/repo` field (mirrors how GitHub
 * URLs read) plus an optional reason. Pasting a full `github.com/owner/repo`
 * URL works too — the parser strips the host.
 */

import { useCallback, useEffect, useState } from 'react';
import { Github, X } from 'lucide-react';
import { InlineTrailLoader } from '@/components/trail/InlineTrailLoader';
import { useTheme } from '@principal-ade/industry-theme';
import { useAuth } from '@/contexts/AuthContext';
import { TopicErrorCodes, type ProjectSuggestion } from '@/lib/topics/types';

interface SuggestProjectDialogProps {
  topicId: string;
  open: boolean;
  onClose: () => void;
  onSubmitted: (suggestion: ProjectSuggestion) => void;
}

const MAX_REASON_CHARS = 500;
const SLUG_PATTERN = /^[A-Za-z0-9._-]+$/;

/**
 * Pull `owner/repo` out of either a plain `owner/repo` string or a full
 * GitHub URL. Returns null if the input doesn't match.
 */
function parseOwnerRepo(
  input: string,
): { owner: string; repo: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const urlMatch = trimmed.match(
    /github\.com\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?(?:[/?#].*)?$/i,
  );
  if (urlMatch) return { owner: urlMatch[1]!, repo: urlMatch[2]! };
  const slashMatch = trimmed.match(/^([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)$/);
  if (slashMatch) return { owner: slashMatch[1]!, repo: slashMatch[2]! };
  return null;
}

export function SuggestProjectDialog({
  topicId,
  open,
  onClose,
  onSubmitted,
}: SuggestProjectDialogProps) {
  const { theme } = useTheme();
  const { isAuthenticated, login } = useAuth();
  const [repoInput, setRepoInput] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setRepoInput('');
      setReason('');
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleSubmit = useCallback(async () => {
    setError(null);
    const parsed = parseOwnerRepo(repoInput);
    if (!parsed) {
      setError('Enter a repo as owner/repo or a github.com URL.');
      return;
    }
    if (!SLUG_PATTERN.test(parsed.owner) || !SLUG_PATTERN.test(parsed.repo)) {
      setError('Repo path has unsupported characters.');
      return;
    }
    setSubmitting(true);
    try {
      const trimmedReason = reason.trim();
      const res = await fetch(`/api/topics/by-id/${topicId}/suggestions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'project',
          owner: parsed.owner,
          repo: parsed.repo,
          ...(trimmedReason ? { reason: trimmedReason } : {}),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body?.code === TopicErrorCodes.SUGGESTION_DUPLICATE) {
          setError('You already have a pending suggestion for this project.');
        } else if (body?.code === TopicErrorCodes.NOT_AUTHENTICATED) {
          setError('Sign in to suggest a project.');
        } else {
          setError(body?.error || `Failed to suggest (${res.status})`);
        }
        return;
      }
      onSubmitted(body.suggestion as ProjectSuggestion);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to suggest');
    } finally {
      setSubmitting(false);
    }
  }, [repoInput, reason, topicId, onSubmitted, onClose]);

  if (!open) return null;

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
        aria-labelledby="suggest-project-title"
        className="w-full max-w-md rounded-lg border"
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
            id="suggest-project-title"
            className="text-base font-semibold truncate"
            style={{ color: theme.colors.text }}
          >
            Suggest a project
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
          {!isAuthenticated ? (
            <div className="text-center">
              <p
                className="text-sm leading-relaxed mb-4"
                style={{ color: theme.colors.text }}
              >
                Sign in with GitHub to suggest a project. Your handle is
                attached to the suggestion so the topic owner knows who
                flagged the repo.
              </p>
              <button
                type="button"
                onClick={() => login(window.location.pathname)}
                className="inline-flex items-center gap-2 px-4 h-10 rounded-md text-sm font-medium hover:opacity-80"
                style={{
                  background: theme.colors.primary,
                  color: theme.colors.background,
                  border: `1px solid ${theme.colors.primary}`,
                  cursor: 'pointer',
                }}
              >
                <Github className="w-4 h-4" />
                Sign in with GitHub
              </button>
            </div>
          ) : (
            <>
          <p
            className="text-sm leading-relaxed mb-4"
            style={{ color: theme.colors.text }}
          >
            Flag a GitHub repo as worth reviewing for this topic. The topic
            owner sees your suggestion; once a trail from that repo lands on
            the topic, your suggestion auto-resolves.
          </p>

          <label
            className="block text-xs uppercase tracking-wide mb-1"
            style={{ color: theme.colors.textMuted }}
          >
            Repository
          </label>
          <input
            type="text"
            value={repoInput}
            onChange={(e) => {
              setRepoInput(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSubmit();
              }
            }}
            placeholder="owner/repo or github.com URL"
            disabled={submitting}
            className="w-full px-3 py-2 rounded-md outline-none text-sm mb-4"
            style={{
              background: theme.colors.background,
              color: theme.colors.text,
              border: `1px solid ${theme.colors.border}`,
              fontFamily: theme.fonts.body,
            }}
            autoFocus
          />

          <label
            className="block text-xs uppercase tracking-wide mb-1"
            style={{ color: theme.colors.textMuted }}
          >
            Why this repo? (optional)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, MAX_REASON_CHARS))}
            rows={3}
            disabled={submitting}
            placeholder="One line on why a trail from this repo would fit the topic."
            className="w-full px-3 py-2 rounded-md outline-none text-sm resize-y"
            style={{
              background: theme.colors.background,
              color: theme.colors.text,
              border: `1px solid ${theme.colors.border}`,
              fontFamily: theme.fonts.body,
            }}
          />
          <div
            className="mt-1 text-xs text-right"
            style={{ color: theme.colors.textMuted }}
          >
            {reason.length} / {MAX_REASON_CHARS}
          </div>

          {error && (
            <p className="mt-3 text-xs" style={{ color: theme.colors.error }}>
              {error}
            </p>
          )}

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md text-sm disabled:opacity-50"
              style={{
                background: 'transparent',
                color: theme.colors.text,
                border: `1px solid ${theme.colors.border}`,
                cursor: submitting ? 'wait' : 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !repoInput.trim()}
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md text-sm font-medium disabled:opacity-50"
              style={{
                background: theme.colors.primary,
                color: theme.colors.background,
                border: `1px solid ${theme.colors.primary}`,
                cursor: submitting ? 'wait' : 'pointer',
              }}
            >
              {submitting && <InlineTrailLoader size={16} />}
              <span>{submitting ? 'Suggesting…' : 'Suggest'}</span>
            </button>
          </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
