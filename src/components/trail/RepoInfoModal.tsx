'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  GitFork,
  Globe,
  List,
  Scale,
  Star,
  CircleDot,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useTheme } from '@principal-ade/industry-theme';
import type { GitHubRepoInfoResponse } from '@/types/api';

interface RepoInfoModalProps {
  owner: string;
  repo: string;
  onClose: () => void;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function RepoInfoModal({ owner, repo, onClose }: RepoInfoModalProps) {
  const { theme } = useTheme();
  const [info, setInfo] = useState<GitHubRepoInfoResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/github/repo/${owner}/${repo}?action=info`,
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (!cancelled) {
            setError(body?.error || `Failed to load repo info (${res.status})`);
          }
          return;
        }
        const data = (await res.json()) as GitHubRepoInfoResponse;
        if (!cancelled) setInfo(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load repo info');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [owner, repo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${owner}/${repo} project info`}
      onClick={onClose}
      className="fixed inset-0 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{
        background: 'rgba(0,0,0,0.55)',
        paddingTop: 'var(--safe-top)',
        zIndex: 2147483000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://github.com/${owner}.png?size=96`}
            alt=""
            width={40}
            height={40}
            className="rounded-full flex-shrink-0"
            style={{ border: `1px solid ${theme.colors.border}` }}
          />
          <a
            href={`https://github.com/${owner}/${repo}`}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 flex-1 transition-opacity hover:opacity-80"
            style={{ color: 'inherit', textDecoration: 'none' }}
            title={`Open ${owner}/${repo} on GitHub`}
          >
            <div
              className="text-xs truncate"
              style={{ color: theme.colors.textMuted }}
            >
              {owner}
            </div>
            <div className="text-base font-semibold truncate hover:underline">
              {repo}
            </div>
          </a>
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

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {error ? (
            <div
              className="text-sm"
              style={{ color: theme.colors.error ?? theme.colors.text }}
            >
              {error}
            </div>
          ) : !info ? (
            <RepoInfoSkeleton borderColor={theme.colors.border} />
          ) : (
            <div className="flex flex-col gap-4">
              {info.description && (
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: theme.colors.text }}
                >
                  {info.description}
                </p>
              )}

              {info.topics?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {info.topics.map((topic) => (
                    <span
                      key={topic}
                      className="px-2 py-0.5 rounded-full text-xs"
                      style={{
                        background: theme.colors.backgroundSecondary,
                        color: theme.colors.primary,
                        border: `1px solid ${theme.colors.border}`,
                      }}
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-sm">
                <Stat
                  icon={<Star className="w-4 h-4" />}
                  label="Stars"
                  value={formatNumber(info.stargazers_count)}
                  color={theme.colors.textMuted}
                />
                <Stat
                  icon={<GitFork className="w-4 h-4" />}
                  label="Forks"
                  value={formatNumber(info.forks_count)}
                  color={theme.colors.textMuted}
                />
                <Stat
                  icon={<CircleDot className="w-4 h-4" />}
                  label="Open issues"
                  value={formatNumber(info.open_issues_count)}
                  color={theme.colors.textMuted}
                />
                {info.language && (
                  <Stat
                    icon={<span className="w-2 h-2 rounded-full bg-current inline-block" />}
                    label="Language"
                    value={info.language}
                    color={theme.colors.textMuted}
                  />
                )}
              </div>

              <div
                className="flex flex-col gap-2 text-sm pt-3 border-t"
                style={{
                  borderColor: theme.colors.border,
                  color: theme.colors.textMuted,
                }}
              >
                <Row
                  label="Default branch"
                  value={info.default_branch}
                />
                {info.license?.name && (
                  <Row
                    icon={<Scale className="w-3.5 h-3.5" />}
                    label="License"
                    value={info.license.name}
                  />
                )}
                {info.homepage && (
                  <Row
                    icon={<Globe className="w-3.5 h-3.5" />}
                    label="Homepage"
                    value={
                      <a
                        href={info.homepage}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate hover:underline"
                        style={{ color: theme.colors.primary }}
                      >
                        {info.homepage.replace(/^https?:\/\//, '')}
                      </a>
                    }
                  />
                )}
                <Row label="Updated" value={formatDate(info.pushed_at)} />
              </div>
            </div>
          )}
        </div>

        <div
          className="px-4 py-3 border-t flex items-center justify-end gap-2"
          style={{ borderColor: theme.colors.border }}
        >
          <Link
            href={`/${owner}/${repo}`}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md text-sm font-medium transition-opacity hover:opacity-90"
            style={{
              background: theme.colors.primary,
              color: theme.colors.background,
              textDecoration: 'none',
            }}
          >
            <List className="w-4 h-4" />
            <span>View all trails</span>
          </Link>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Stat({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span style={{ color }}>{icon}</span>
      <span className="font-semibold">{value}</span>
      <span style={{ color }}>{label}</span>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 min-w-0">
      <span className="inline-flex items-center gap-1.5 flex-shrink-0">
        {icon}
        {label}
      </span>
      <span className="truncate text-right">{value}</span>
    </div>
  );
}

function RepoInfoSkeleton({ borderColor }: { borderColor: string }) {
  const block = (h: number, w?: string) => (
    <div
      style={{
        height: h,
        width: w ?? '100%',
        background: borderColor,
        borderRadius: 6,
        opacity: 0.4,
      }}
    />
  );
  return (
    <div className="flex flex-col gap-3 animate-pulse">
      {block(14)}
      {block(14, '80%')}
      <div className="grid grid-cols-2 gap-3 pt-2">
        {block(16)}
        {block(16)}
        {block(16)}
        {block(16)}
      </div>
    </div>
  );
}
