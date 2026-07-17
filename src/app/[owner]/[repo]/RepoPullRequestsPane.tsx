'use client';

/**
 * RepoPullRequestsPane
 *
 * Left-rail view listing the repo's GitHub pull requests (newest-updated
 * first), filterable by open / closed / all. Selecting a PR opens it in the
 * File City panel's native PR mode (header + description + Files/Details tabs,
 * changed buildings lit on the city). Mirrors RepoIssuesPane; PRs are loaded a
 * page at a time via `useRepoPullRequests`.
 */

import React from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import {
  GitPullRequest,
  GitPullRequestClosed,
  GitMerge,
  ChevronLeft,
} from 'lucide-react';
import type { components } from '@octokit/openapi-types';
import {
  useRepoPullRequests,
  type PrStateFilter,
} from '@/hooks/useRepoPullRequests';
import { InlineTrailLoader } from '@/components/trail/InlineTrailLoader';

type GitHubPullRequestSimple = components['schemas']['pull-request-simple'];

const OPEN_COLOR = '#22c55e';
const MERGED_COLOR = '#8957e5';
const CLOSED_COLOR = '#cf222e';

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

const PrRow: React.FC<{
  pr: GitHubPullRequestSimple;
  selected: boolean;
  onSelect: () => void;
  onHover?: (hovering: boolean) => void;
}> = ({ pr, selected, onSelect, onHover }) => {
  const { theme } = useTheme();
  // GitHub encodes a merged PR as state:'closed' + a set merged_at.
  const isMerged = Boolean(pr.merged_at);
  const isClosed = pr.state === 'closed' && !isMerged;
  const StateIcon = isMerged
    ? GitMerge
    : isClosed
      ? GitPullRequestClosed
      : GitPullRequest;
  const stateColor = isMerged
    ? MERGED_COLOR
    : isClosed
      ? CLOSED_COLOR
      : OPEN_COLOR;
  // Unlike issue labels (a `string | object` union), `pull-request-simple`
  // labels are plain objects with a required `name`.
  const labels = (pr.labels ?? [])
    .map((l) => ({ name: l.name, color: l.color ?? undefined }))
    .filter((l) => Boolean(l.name));

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
        onHover?.(true);
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.background = 'transparent';
        onHover?.(false);
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
          {pr.title}
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
          <span>#{pr.number}</span>
          <span>· {relativeTime(pr.updated_at)}</span>
          {pr.draft && <span>· Draft</span>}
        </div>
      </div>
    </button>
  );
};

export const RepoPullRequestsPane: React.FC<{
  owner: string;
  repo: string;
  selectedPrNumber: number | null;
  onSelectPr: (prNumber: number | null) => void;
  /** Close the pull-requests view and return to the tours / About rail. */
  onClose?: () => void;
  /** Reports the PR numbers currently visible in the list (for heatmap). */
  onVisiblePrsChange?: (prNumbers: number[]) => void;
  /** Hover a PR row — highlights its files on the city. */
  onHoverPr?: (prNumber: number | null) => void;
  /** When set, only show PRs in this list (file-driven filter). */
  filteredPrNumbers?: number[] | null;
  /** Clear the file-driven filter. */
  onClearFileFilter?: () => void;
}> = ({
  owner,
  repo,
  selectedPrNumber,
  onSelectPr,
  onClose,
  onVisiblePrsChange,
  onHoverPr,
  filteredPrNumbers,
  onClearFileFilter,
}) => {
  const { theme } = useTheme();
  const [stateFilter, setStateFilter] = React.useState<PrStateFilter>('open');
  const { pullRequests, loading, loadingMore, error, hasMore, loadMore, refresh } =
    useRepoPullRequests(owner, repo, { state: stateFilter });

  // File-driven filter: when a building is clicked in the city, narrow the list.
  const displayedPullRequests = React.useMemo(() => {
    if (!filteredPrNumbers) return pullRequests;
    const allowed = new Set(filteredPrNumbers);
    return pullRequests.filter((pr) => allowed.has(pr.number));
  }, [pullRequests, filteredPrNumbers]);

  React.useEffect(() => {
    onVisiblePrsChange?.(pullRequests.map((pr) => pr.number));
  }, [pullRequests, onVisiblePrsChange]);

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
          Pull requests
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

      {/* File-driven filter indicator — shown when a building was clicked in the city. */}
      {filteredPrNumbers && (
        <div
          className="flex items-center gap-2 px-3 py-1.5 border-b shrink-0"
          style={{
            borderColor: theme.colors.border,
            background: theme.colors.backgroundSecondary,
          }}
        >
          <span
            className="flex-1 truncate"
            style={{
              color: theme.colors.text,
              fontSize: theme.fontSizes[0],
            }}
          >
            {filteredPrNumbers.length} PR{filteredPrNumbers.length !== 1 ? 's' : ''} touch this file
          </span>
          <button
            type="button"
            onClick={onClearFileFilter}
            className="shrink-0 px-1.5 py-0.5 rounded transition-opacity hover:opacity-70"
            style={{
              color: theme.colors.textMuted,
              fontSize: theme.fontSizes[0],
              cursor: 'pointer',
            }}
          >
            Clear
          </button>
        </div>
      )}

      {loading && pullRequests.length === 0 ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center py-12 gap-3">
          <InlineTrailLoader size={40} />
          <span
            style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[1] }}
          >
            Loading pull requests…
          </span>
        </div>
      ) : error && pullRequests.length === 0 ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center py-12 gap-3 px-6 text-center">
          <span
            style={{ color: theme.colors.error, fontSize: theme.fontSizes[1] }}
          >
            Failed to load pull requests
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
      ) : pullRequests.length === 0 ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center py-12 px-6 text-center">
          <span
            style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[1] }}
          >
            No {stateFilter === 'all' ? '' : `${stateFilter} `}pull requests found
          </span>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {displayedPullRequests.map((pr) => (
            <PrRow
              key={pr.id}
              pr={pr}
              selected={pr.number === selectedPrNumber}
              onSelect={() =>
                onSelectPr(pr.number === selectedPrNumber ? null : pr.number)
              }
              onHover={(hovering) => onHoverPr?.(hovering ? pr.number : null)}
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
