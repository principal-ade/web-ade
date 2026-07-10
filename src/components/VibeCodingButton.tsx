'use client';

import { useCallback, useState, useRef, useEffect } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { Code2, Loader2 } from 'lucide-react';
import type { GitHubCodeSearchResponse } from '@/types/api';

interface VibeCodingButtonProps {
  owner: string;
  repo: string;
  onHighlight?: (paths: string[] | null) => void;
}

export default function VibeCodingButton({ owner, repo, onHighlight }: VibeCodingButtonProps) {
  const { theme } = useTheme();
  const [fileCount, setFileCount] = useState<number | null>(null);
  const [occurrenceCount, setOccurrenceCount] = useState<number | null>(null);
  const [files, setFiles] = useState<{ path: string; html_url: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const search = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/github/code-search?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&q=isRecord`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || `GitHub API error (${res.status})`);
      }
      const data: GitHubCodeSearchResponse = await res.json();
      setFileCount(data.total_files);
      setOccurrenceCount(data.total_occurrences);
      setFiles(data.items);
      onHighlight?.(data.items.map((i) => i.path));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      onHighlight?.(null);
    } finally {
      setLoading(false);
    }
  }, [owner, repo, loading, onHighlight]);

  const clear = useCallback(() => {
    onHighlight?.(null);
    setFileCount(null);
    setOccurrenceCount(null);
    setFiles([]);
    setShowDropdown(false);
  }, [onHighlight]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (fileCount === null && !loading && !error) {
            search();
          } else if (fileCount !== null && !loading && showDropdown) {
            clear();
          } else {
            setShowDropdown((prev) => !prev);
          }
        }}
        className="hidden md:flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80"
        style={{
          color: occurrenceCount != null ? theme.colors.primary : theme.colors.text,
          background:
            occurrenceCount != null
              ? `color-mix(in srgb, ${theme.colors.primary} 15%, transparent)`
              : 'transparent',
        }}
        title={`Search for isRecord in ${owner}/${repo}`}
        aria-label="Vibe coding detector"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Code2 className="w-4 h-4" />
        )}
      </button>

      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute right-0 top-full mt-2 z-50 min-w-[280px] max-w-[400px] rounded-lg border shadow-lg p-3"
          style={{
            background: theme.colors.surface,
            borderColor: theme.colors.border,
            color: theme.colors.text,
          }}
        >
          {loading && (
            <div className="flex items-center gap-2 text-sm" style={{ color: theme.colors.textMuted }}>
              <Loader2 className="w-3 h-3 animate-spin" />
              Searching for <code style={{ fontFamily: theme.fonts.monospace }}>isRecord</code>
              ...
            </div>
          )}

          {error && (
            <div className="text-sm" style={{ color: theme.colors.error ?? theme.colors.textMuted }}>
              {error}
            </div>
          )}

          {fileCount !== null && !loading && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">
                  <strong>{occurrenceCount}</strong> occurrence{occurrenceCount !== 1 ? 's' : ''} across{' '}
                  <strong>{fileCount}</strong> file{fileCount !== 1 ? 's' : ''}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      clear();
                    }}
                    className="text-xs px-2 py-1 rounded transition-opacity hover:opacity-80"
                    style={{
                      background: `color-mix(in srgb, ${theme.colors.textMuted} 15%, transparent)`,
                      color: theme.colors.textMuted,
                    }}
                    title="Clear highlights"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      search();
                    }}
                    className="text-xs px-2 py-1 rounded transition-opacity hover:opacity-80"
                    style={{
                      background: `color-mix(in srgb, ${theme.colors.primary} 15%, transparent)`,
                      color: theme.colors.primary,
                    }}
                  >
                    Refresh
                  </button>
                </div>
              </div>
              <div
                className="text-xs mb-2 px-2 py-1 rounded"
                style={{
                  background: `color-mix(in srgb, ${theme.colors.primary} 8%, transparent)`,
                  color: theme.colors.textSecondary,
                }}
              >
                <code style={{ fontFamily: theme.fonts.monospace }}>isRecord</code>{' '}
                found in this codebase — a vibe-coding heuristic
              </div>
              {files.length > 0 && (
                <div
                  className="max-h-[240px] overflow-y-auto space-y-1"
                  style={{
                    scrollbarWidth: 'thin',
                  }}
                >
                  {files.slice(0, 50).map((f) => (
                    <a
                      key={f.path}
                      href={f.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate rounded px-1.5 py-1 text-xs transition-colors hover:opacity-80"
                      style={{
                        color: theme.colors.textSecondary,
                        fontFamily: theme.fonts.monospace,
                      }}
                    >
                      {f.path}
                    </a>
                  ))}
                  {files.length > 50 && (
                    <div className="text-xs pt-1" style={{ color: theme.colors.textMuted }}>
                      +{files.length - 50} more files
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {fileCount === null && !loading && !error && (
            <div className="text-sm" style={{ color: theme.colors.textMuted }}>
              Click to search for <code style={{ fontFamily: theme.fonts.monospace }}>isRecord</code>{' '}
              across this codebase.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
