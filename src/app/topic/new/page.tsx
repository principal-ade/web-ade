'use client';

/**
 * /topic/new — create a topic.
 *
 * Authenticated users only. Lightweight form: title, description, optional
 * first trail URL. POSTs to /api/topics and routes to the new topic page on
 * success. Subsequent trails are added from the topic view itself.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { Plus } from 'lucide-react';
import { TrailLoadingAnimation } from '@/components/trail/TrailLoadingAnimation';
import { useTheme } from '@principal-ade/industry-theme';
import { useAuth } from '@/contexts/AuthContext';
import { extractTrailId } from '@/lib/topics/validation';
import type { CreateTopicResponse } from '@/lib/topics/types';

export default function NewTopicPage() {
  const { theme } = useTheme();
  const router = useRouter();
  const { user, isLoading, login } = useAuth();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [trailInput, setTrailInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    setError(null);
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    const trailIds: string[] = [];
    if (trailInput.trim()) {
      const tid = extractTrailId(trailInput);
      if (!tid) {
        setError('First trail must be a valid /trail/<id> URL or uuid');
        return;
      }
      trailIds.push(tid);
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/topics', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description,
          trailIds,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error || `Failed to create topic (${res.status})`);
        return;
      }
      const { id } = body as CreateTopicResponse;
      router.push(`/topic/${id}`);
    } finally {
      setSubmitting(false);
    }
  }, [title, description, trailInput, router]);

  if (isLoading) {
    return (
      <div
        className="w-screen flex items-center justify-center"
        style={{ background: theme.colors.background, height: '100vh' }}
      >
        <div style={{ width: 'min(80vmin, 600px)', height: 'min(80vmin, 600px)' }}>
          <TrailLoadingAnimation message="Loading" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div
        className="w-screen flex items-center justify-center px-4"
        style={{ background: theme.colors.background, height: '100vh' }}
      >
        <div
          className="w-full max-w-md rounded-lg border px-8 py-10 text-center"
          style={{
            background:
              theme.colors.backgroundSecondary ?? theme.colors.background,
            borderColor: theme.colors.border,
            color: theme.colors.text,
          }}
        >
          <h1 className="text-xl font-semibold mb-2">Sign in to create a topic</h1>
          <p
            className="text-sm mb-6"
            style={{ color: theme.colors.textMuted }}
          >
            Topics are owned by the GitHub account that created them.
          </p>
          <button
            type="button"
            onClick={() => login()}
            className="px-4 py-2 rounded-md text-sm font-medium"
            style={{
              background: theme.colors.primary,
              color: theme.colors.background,
              border: `1px solid ${theme.colors.primary}`,
            }}
          >
            Sign in with GitHub
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: theme.colors.background, color: theme.colors.text }}
    >
      <header
        className="border-b px-4 py-3 flex items-center"
        style={{
          background: theme.colors.surface,
          borderColor: theme.colors.border,
        }}
      >
        <Link
          href="/"
          className="text-xl font-bold transition-opacity hover:opacity-80"
          style={{ fontFamily: theme.fonts.body, textDecoration: 'none' }}
        >
          <span style={{ color: theme.colors.text }}>Principal</span>{' '}
          <span style={{ color: theme.colors.primary }}>AI</span>
        </Link>
        <span
          className="mx-2"
          style={{ color: theme.colors.textMuted }}
          aria-hidden="true"
        >
          /
        </span>
        <span
          className="text-base font-semibold"
          style={{ color: theme.colors.text }}
        >
          New topic
        </span>
      </header>

      <main className="flex-1 px-4 md:px-8 py-8 max-w-2xl w-full mx-auto">
        <h1 className="text-2xl font-bold mb-1">Create a topic</h1>
        <p
          className="text-sm mb-6"
          style={{ color: theme.colors.textMuted }}
        >
          A place to curate trails on a shared subject — typically the same
          conceptual problem solved across different repos.
        </p>

        <label
          className="block text-xs uppercase tracking-wide mb-1"
          style={{ color: theme.colors.textMuted }}
        >
          Title
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder='e.g. "Detecting & streaming working-tree changes"'
          className="w-full mb-5 px-3 py-2 rounded-md outline-none"
          style={{
            background:
              theme.colors.backgroundSecondary ?? theme.colors.background,
            color: theme.colors.text,
            border: `1px solid ${theme.colors.border}`,
          }}
        />

        <label
          className="block text-xs uppercase tracking-wide mb-1"
          style={{ color: theme.colors.textMuted }}
        >
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          placeholder="Markdown. Frame the discussion — what question do these trails answer?"
          className="w-full mb-5 px-3 py-2 rounded-md outline-none resize-y"
          style={{
            background:
              theme.colors.backgroundSecondary ?? theme.colors.background,
            color: theme.colors.text,
            border: `1px solid ${theme.colors.border}`,
            fontFamily: theme.fonts.body,
          }}
        />

        <label
          className="block text-xs uppercase tracking-wide mb-1"
          style={{ color: theme.colors.textMuted }}
        >
          First trail{' '}
          <span style={{ textTransform: 'none' }}>(optional)</span>
        </label>
        <input
          type="text"
          value={trailInput}
          onChange={(e) => setTrailInput(e.target.value)}
          placeholder="Paste a /trail/<id> URL"
          className="w-full mb-6 px-3 py-2 rounded-md outline-none"
          style={{
            background:
              theme.colors.backgroundSecondary ?? theme.colors.background,
            color: theme.colors.text,
            border: `1px solid ${theme.colors.border}`,
          }}
        />

        {error && (
          <p
            className="mb-4 text-sm"
            style={{ color: theme.colors.error }}
          >
            {error}
          </p>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !title.trim()}
            className="inline-flex items-center gap-1.5 px-4 h-9 rounded-md text-sm font-medium disabled:opacity-50"
            style={{
              background: theme.colors.primary,
              color: theme.colors.background,
              border: `1px solid ${theme.colors.primary}`,
            }}
          >
            <Plus className="w-4 h-4" />
            {submitting ? 'Creating…' : 'Create topic'}
          </button>
          <Link
            href="/"
            className="text-sm"
            style={{ color: theme.colors.textMuted }}
          >
            Cancel
          </Link>
        </div>
      </main>
    </div>
  );
}
