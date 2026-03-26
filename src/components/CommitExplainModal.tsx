'use client';

import { useState, useCallback } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { X, Loader2, ArrowLeft, Sparkles, Code, Users } from 'lucide-react';
import { IndustryMarkdownSlide } from 'themed-markdown';
import type { ActivityCommit } from '@/hooks/useGitHubActivityFeed';

interface CommitExplainModalProps {
  isOpen: boolean;
  onClose: () => void;
  commits: ActivityCommit[];
  repoName: string;
}

type ModalState = 'selecting' | 'loading' | 'result' | 'error';
type AudienceLevel = 'maintainer' | 'non-technical';

export function CommitExplainModal({
  isOpen,
  onClose,
  commits,
  repoName,
}: CommitExplainModalProps) {
  const { theme } = useTheme();
  const [state, setState] = useState<ModalState>('selecting');
  const [audienceLevel, setAudienceLevel] = useState<AudienceLevel | null>(null);
  const [explanation, setExplanation] = useState('');
  const [error, setError] = useState<string | null>(null);

  const resetModal = useCallback(() => {
    setState('selecting');
    setAudienceLevel(null);
    setExplanation('');
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    resetModal();
    onClose();
  }, [onClose, resetModal]);

  const handleBack = useCallback(() => {
    resetModal();
  }, [resetModal]);

  const generateExplanation = useCallback(async (level: AudienceLevel) => {
    setAudienceLevel(level);
    setState('loading');
    setExplanation('');
    setError(null);

    const payload = {
      commits: commits.map(c => ({
        sha: c.sha,
        message: c.message,
        author: c.author,
        additions: c.additions,
        deletions: c.deletions,
      })),
      audienceLevel: level,
      repoName,
    };
    console.log('[CommitExplainModal] Sending payload:', payload);

    try {
      const response = await fetch('/api/explain-commits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Failed to generate explanation');
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'text') {
                setExplanation(prev => prev + data.content);
                setState('result');
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }

      setState('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setState('error');
    }
  }, [commits, repoName]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
      style={{ backgroundColor: `${theme.colors.background}cc` }}
      onClick={(e) => {
        if (e.target === e.currentTarget && state !== 'loading') {
          handleClose();
        }
      }}
    >
      <div
        className="rounded-lg shadow-xl max-w-lg w-full mx-4"
        style={{
          background: theme.colors.surface,
          border: `1px solid ${theme.colors.border}`,
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: `1px solid ${theme.colors.border}` }}
        >
          <div className="flex items-center gap-3">
            {(state === 'result' || state === 'error') && (
              <button
                onClick={handleBack}
                className="flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80"
                style={{
                  background: theme.colors.secondary,
                  color: theme.colors.text,
                }}
                title="Back"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <Sparkles className="w-5 h-5" style={{ color: theme.colors.primary }} />
            <h2 className="text-lg font-semibold" style={{ color: theme.colors.text }}>
              Explain Changes
            </h2>
          </div>
          <button
            onClick={handleClose}
            disabled={state === 'loading'}
            className="flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80 disabled:opacity-50"
            style={{
              background: theme.colors.secondary,
              color: theme.colors.text,
            }}
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          {state === 'selecting' && (
            <div className="space-y-4">
              <p className="text-sm" style={{ color: theme.colors.textMuted }}>
                How would you like these {commits.length} commit{commits.length !== 1 ? 's' : ''} explained?
              </p>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => generateExplanation('maintainer')}
                  className="flex flex-col items-center gap-3 p-6 rounded-lg transition-all hover:opacity-90"
                  style={{
                    background: theme.colors.background,
                    border: `2px solid ${theme.colors.border}`,
                  }}
                >
                  <Code className="w-8 h-8" style={{ color: theme.colors.primary }} />
                  <span className="font-medium" style={{ color: theme.colors.text }}>
                    I&apos;m a maintainer
                  </span>
                  <span className="text-xs text-center" style={{ color: theme.colors.textMuted }}>
                    Technical details and implications
                  </span>
                </button>
                <button
                  onClick={() => generateExplanation('non-technical')}
                  className="flex flex-col items-center gap-3 p-6 rounded-lg transition-all hover:opacity-90"
                  style={{
                    background: theme.colors.background,
                    border: `2px solid ${theme.colors.border}`,
                  }}
                >
                  <Users className="w-8 h-8" style={{ color: theme.colors.primary }} />
                  <span className="font-medium" style={{ color: theme.colors.text }}>
                    Just browsing
                  </span>
                  <span className="text-xs text-center" style={{ color: theme.colors.textMuted }}>
                    Simple, friendly explanation
                  </span>
                </button>
              </div>
            </div>
          )}

          {state === 'loading' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: theme.colors.primary }} />
              <p className="text-sm" style={{ color: theme.colors.textMuted }}>
                Generating {audienceLevel === 'maintainer' ? 'technical' : 'friendly'} explanation...
              </p>
            </div>
          )}

          {state === 'result' && (
            <div className="max-h-[400px] overflow-y-auto">
              <IndustryMarkdownSlide
                content={explanation}
                theme={theme}
                slideIdPrefix="commit-explain"
                slideIndex={0}
                transparentBackground
              />
            </div>
          )}

          {state === 'error' && (
            <div className="space-y-4">
              <div
                className="flex items-center gap-2 px-4 py-3 rounded-md text-sm"
                style={{
                  background: `${theme.colors.error}20`,
                  color: theme.colors.error,
                }}
              >
                {error}
              </div>
              <button
                onClick={() => audienceLevel && generateExplanation(audienceLevel)}
                className="w-full px-4 py-2 rounded-md text-sm font-medium transition-all hover:opacity-80"
                style={{
                  background: theme.colors.primary,
                  color: theme.colors.textOnPrimary,
                }}
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
