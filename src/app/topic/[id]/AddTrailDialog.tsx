'use client';

/**
 * Owner-only modal for adding a trail to the topic directly — paste a
 * `/trail/<id>` URL (or a bare id) and it's appended immediately via
 * POST /api/topics/by-id/{id}/trails. No review step; this is the topic
 * owner's direct-add path, distinct from the agent-assisted "Contribute
 * Trail" suggestion flow (see {@link ./SuggestTrailDialog}) that non-owners
 * use to propose a trail for review.
 */

import { useCallback, useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { InlineTrailLoader } from '@/components/trail/InlineTrailLoader';
import { useTheme } from '@principal-ade/industry-theme';
import { extractTrailId } from '@/lib/topics/validation';
import type { TopicPayload } from '@/lib/topics/types';

interface AddTrailDialogProps {
  topicId: string;
  open: boolean;
  onClose: () => void;
  /** Receives the updated topic returned by the add endpoint. */
  onAdded: (topic: TopicPayload) => void;
}

export function AddTrailDialog({
  topicId,
  open,
  onClose,
  onAdded,
}: AddTrailDialogProps) {
  const { theme } = useTheme();
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setInput('');
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
    const trailId = extractTrailId(input);
    if (!trailId) {
      setError('Paste a trail URL or id (e.g. /trail/<uuid>)');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/topics/by-id/${topicId}/trails`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ trailId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error || `Failed to add trail (${res.status})`);
        return;
      }
      onAdded(body.topic as TopicPayload);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add trail');
    } finally {
      setSubmitting(false);
    }
  }, [input, topicId, onAdded, onClose]);

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
        aria-labelledby="add-trail-title"
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
            id="add-trail-title"
            className="text-base font-semibold truncate"
            style={{ color: theme.colors.text }}
          >
            Add a trail
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
          <p
            className="text-sm leading-relaxed mb-4"
            style={{ color: theme.colors.text }}
          >
            Paste a trail link to add it to this topic right away. The trail
            stays where it lives — this topic just references it.
          </p>

          <label
            className="block text-xs uppercase tracking-wide mb-1"
            style={{ color: theme.colors.textMuted }}
          >
            Trail URL or id
          </label>
          <input
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleSubmit();
              }
            }}
            placeholder="Paste a /trail/<id> URL or id"
            disabled={submitting}
            className="w-full px-3 py-2 rounded-md outline-none text-sm"
            style={{
              background: theme.colors.background,
              color: theme.colors.text,
              border: `1px solid ${theme.colors.border}`,
              fontFamily: theme.fonts.body,
            }}
            autoFocus
          />

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
              disabled={submitting || !input.trim()}
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md text-sm font-medium disabled:opacity-50"
              style={{
                background: theme.colors.primary,
                color: theme.colors.background,
                border: `1px solid ${theme.colors.primary}`,
                cursor: submitting ? 'wait' : 'pointer',
              }}
            >
              {submitting ? (
                <InlineTrailLoader size={16} />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              <span>{submitting ? 'Adding…' : 'Add trail'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
