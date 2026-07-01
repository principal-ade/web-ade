'use client';

/**
 * RepoIssuesPane
 *
 * Left-rail view listing the repo's GitHub issues (newest-updated first),
 * filterable by open / closed / all. Selecting an issue opens it in the File
 * City panel's native issue mode (header + body + reporter card, city framed as
 * context). Mirrors RepoActivityPane's commit list; issues are loaded a page at
 * a time via `useRepoIssues`.
 */

import React from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { CircleDot, CheckCircle2, ChevronLeft, MessageSquare } from 'lucide-react';
import type { components } from '@octokit/openapi-types';
import { useRepoIssues, type IssueStateFilter } from '@/hooks/useRepoIssues';
import { InlineTrailLoader } from '@/components/trail/InlineTrailLoader';

type GitHubIssue = components['schemas']['issue'];

const OPEN_COLOR = '#22c55e';
const CLOSED_COLOR = '#8957e5';

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.max(0, (Date.now() - then) / 1000);
  const DAY = 86400;
  if (secs < DAY) return 'today';
  const days = Math.floor(secs / DAY);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/** GitHub stores label colors as `d73a4a` (no `#`); normalize for CSS. */
function labelColor(color: string | undefined | null): string | null {
  const c = color?.trim();
  if (!c) return null;
  return c.startsWith('#') ? c : `#${c}`;
}

const IssueRow: React.FC<{
  issue: GitHubIssue;
  selected: boolean;
  onSelect: () => void;
}> = ({ issue, selected, onSelect }) => {
  const { theme } = useTheme();
  const isOpen = issue.state !== 'closed';
  const StateIcon = isOpen ? CircleDot : CheckCircle2;
  const stateColor = isOpen ? OPEN_COLOR : CLOSED_COLOR;
  // Labels are a `string | object` union in the schema; normalize to {name,color}.
  const labels = (issue.labels ?? [])
    .map((l) =>
      typeof l === 'string'
        ? { name: l, color: undefined as string | undefined }
        : { name: l.name, color: l.color ?? undefined },
    )
    .filter((l): l is { name: string; color: string | undefined } =>
      Boolean(l.name),
    );

  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left border-b"
      style={{
        borderColor: theme.colors.border,
        background: selected ? theme.colors.backgroundSecondary : 'transparent',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        if (!selected)
          e.currentTarget.style.background = theme.colors.backgroundSecondary;
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.background = 'transparent';
      }}
    >
      <StateIcon
        size={16}
        style={{ color: stateColor, flexShrink: 0, marginTop: 2 }}
      />
      <div className="min-w-0 flex-1 flex flex-col gap-1">
        <span
          className="line-clamp-2"
          style={{
            color: theme.colors.text,
            fontSize: theme.fontSizes[1],
            fontWeight: 500,
            lineHeight: 1.35,
          }}
        >
          {issue.title}
        </span>
        {labels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {labels.slice(0, 4).map((l) => {
              const color = labelColor(l.color) ?? theme.colors.textMuted;
              return (
                <span
                  key={l.name}
                  className="inline-flex items-center gap-1 rounded-full px-1.5"
                  style={{
                    border: `1px solid ${color}55`,
                    background: `${color}22`,
                    fontSize: theme.fontSizes[0],
                    color: theme.colors.textSecondary,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: color,
                    }}
                  />
                  {l.name}
                </span>
              );
            })}
          </div>
        )}
        <div
          className="flex items-center gap-2"
          style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[0] }}
        >
          <span>#{issue.number}</span>
          <span>· {relativeTime(issue.updated_at)}</span>
          {issue.comments > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <MessageSquare size={11} /> {issue.comments}
            </span>
          )}
        </div>
      </div>
    </button>
  );
};

export const RepoIssuesPane: React.FC<{
  owner: string;
  repo: string;
  selectedIssueNumber: number | null;
  onSelectIssue: (issueNumber: number | null) => void;
  /** Close the issues view and return to the tours / About rail. */
  onClose?: () => void;
}> = ({ owner, repo, selectedIssueNumber, onSelectIssue, onClose }) => {
  const { theme } = useTheme();
  const [stateFilter, setStateFilter] = React.useState<IssueStateFilter>('open');
  const { issues, loading, loadingMore, error, hasMore, loadMore, refresh } =
    useRepoIssues(owner, repo, { state: stateFilter });

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header — back button, title, open/closed/all filter. */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 border-b shrink-0"
        style={{ borderColor: theme.colors.border }}
      >
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 p-1 rounded transition-opacity hover:opacity-70"
            style={{ color: theme.colors.textMuted, cursor: 'pointer' }}
            title="Back"
          >
            <ChevronLeft size={18} />
          </button>
        )}
        <span
          className="flex-1"
          style={{
            color: theme.colors.text,
            fontSize: theme.fontSizes[2],
            fontWeight: theme.fontWeights.semibold,
          }}
        >
          Issues
        </span>
        <div className="flex items-center gap-1">
          {(['open', 'closed', 'all'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStateFilter(s)}
              className="px-2 py-0.5 rounded transition-colors"
              style={{
                fontSize: theme.fontSizes[0],
                textTransform: 'capitalize',
                cursor: 'pointer',
                background:
                  stateFilter === s
                    ? theme.colors.backgroundSecondary
                    : 'transparent',
                color:
                  stateFilter === s ? theme.colors.text : theme.colors.textMuted,
                border: `1px solid ${
                  stateFilter === s ? theme.colors.border : 'transparent'
                }`,
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading && issues.length === 0 ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center py-12 gap-3">
          <InlineTrailLoader size={40} />
          <span
            style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[1] }}
          >
            Loading issues…
          </span>
        </div>
      ) : error && issues.length === 0 ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center py-12 gap-3 px-6 text-center">
          <span
            style={{ color: theme.colors.error, fontSize: theme.fontSizes[1] }}
          >
            Failed to load issues
          </span>
          <span
            style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[0] }}
          >
            {error}
          </span>
          <button
            type="button"
            onClick={refresh}
            className="px-3 py-1.5 rounded transition-opacity hover:opacity-80"
            style={{
              background: theme.colors.backgroundSecondary,
              color: theme.colors.text,
              border: `1px solid ${theme.colors.border}`,
              fontSize: theme.fontSizes[1],
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      ) : issues.length === 0 ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center py-12 px-6 text-center">
          <span
            style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[1] }}
          >
            No {stateFilter === 'all' ? '' : `${stateFilter} `}issues found
          </span>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {issues.map((issue) => (
            <IssueRow
              key={issue.id}
              issue={issue}
              selected={issue.number === selectedIssueNumber}
              onSelect={() =>
                onSelectIssue(
                  issue.number === selectedIssueNumber ? null : issue.number,
                )
              }
            />
          ))}
          {hasMore && (
            <div className="p-3">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full py-2 rounded flex items-center justify-center gap-2 transition-opacity hover:opacity-80"
                style={{
                  background: theme.colors.backgroundSecondary,
                  color: theme.colors.text,
                  border: `1px solid ${theme.colors.border}`,
                  fontSize: theme.fontSizes[1],
                  cursor: loadingMore ? 'default' : 'pointer',
                }}
              >
                {loadingMore ? (
                  <>
                    <InlineTrailLoader size={14} /> Loading…
                  </>
                ) : (
                  'Load more'
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
