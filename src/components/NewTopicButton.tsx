'use client';

/**
 * The header "New topic" button. Creating a topic requires signing in, so for
 * signed-out users we intercept the click and show a login modal instead of
 * sending them to /topic/new only for that page to tell them to sign in. Signed-
 * in users get a plain link (cmd/middle-click still opens a new tab).
 */

import Link from 'next/link';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X } from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';
import { useAuth } from '@/contexts/AuthContext';

export function NewTopicButton() {
  const { theme } = useTheme();
  const { user, isLoading, login } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <Link
        href="/topic/new"
        onClick={(e) => {
          // Auth still resolving → let the link proceed; /topic/new handles it.
          if (!isLoading && !user) {
            e.preventDefault();
            setModalOpen(true);
          }
        }}
        className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-opacity hover:opacity-80"
        style={{
          background: theme.colors.primary,
          color: theme.colors.textOnPrimary,
          border: `1px solid ${theme.colors.primary}`,
          textDecoration: 'none',
        }}
      >
        <Plus size={14} />
        <span className="hidden sm:inline">New topic</span>
      </Link>

      {modalOpen && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          onClick={() => setModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Sign in to create a topic"
        >
          <div
            className="absolute inset-0 backdrop-blur-md"
            style={{
              background: `color-mix(in srgb, ${theme.colors.background} 70%, transparent)`,
            }}
          />

          <div
            className="relative w-full max-w-md rounded-2xl p-6 backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: `color-mix(in srgb, ${theme.colors.surface} 85%, transparent)`,
              border: `1px solid color-mix(in srgb, ${theme.colors.primary} 35%, transparent)`,
              boxShadow: `0 30px 80px -20px color-mix(in srgb, ${theme.colors.primary} 25%, transparent)`,
            }}
          >
            <div className="flex items-start justify-between gap-4 mb-3">
              <h3
                className="text-xl font-semibold tracking-tight"
                style={{ color: theme.colors.text }}
              >
                Sign in to create a topic
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
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
              className="text-sm leading-relaxed mb-6"
              style={{ color: theme.colors.textMuted }}
            >
              Topics are owned by the GitHub account that created them. Sign in to
              create a new topic.
            </p>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => login('/topic/new')}
                className="inline-flex items-center justify-center px-4 h-9 rounded-md text-sm font-medium transition-opacity hover:opacity-80"
                style={{
                  background: theme.colors.primary,
                  color: theme.colors.textOnPrimary,
                  border: `1px solid ${theme.colors.primary}`,
                }}
              >
                Sign in with GitHub
              </button>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-sm"
                style={{ color: theme.colors.textMuted }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
