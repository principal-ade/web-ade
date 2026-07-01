'use client';

import React from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';

// ---------------------------------------------------------------------------
// RailPaneHeader — the sticky header a rail's destination pane leads with. It
// carries an eyebrow title (icon + label + optional count) and a dismiss
// control: a trailing X by default, or a leading back chevron (`closeAsBack`)
// for panes that slide in over an overview. Extracted from the owner/repo
// explorer so the signed-in home rail reuses the same back-to-overview mechanic.
// ---------------------------------------------------------------------------

export const RailPaneHeader: React.FC<{
  icon: React.ReactNode;
  label: string;
  count?: number;
  onClose: () => void;
  onBack?: () => void;
  backContent?: React.ReactNode;
  // Render the pane's dismiss control as a leading back button (chevron) instead
  // of a trailing X. Back always goes up one level: a nested `onBack` (e.g. a
  // selected-item drilldown) takes priority, otherwise `onClose` returns to the
  // overview. Used by the nav-card panes that slide in over the overview.
  closeAsBack?: boolean;
  // Breadcrumb tail appended after the label (closeAsBack only): drilling in
  // extends the header ("‹ CONTRIBUTORS › @handle") instead of replacing it. The
  // label stays the back target; the crumb marks where you are.
  crumb?: React.ReactNode;
}> = ({ icon, label, count, onClose, onBack, backContent, closeAsBack, crumb }) => {
  const { theme } = useTheme();

  if (closeAsBack) {
    // Back goes up one level: a nested `onBack` (e.g. the selected contributor)
    // returns to this pane's list, otherwise `onClose` returns to the overview.
    const goBack = onBack ?? onClose;
    const backLabel = onBack ? `Back to ${label.toLowerCase()}` : 'Back to overview';
    return (
      <div
        className="px-3 py-2 border-b sticky top-0 z-10 shrink-0 flex items-center gap-1.5"
        style={{
          borderColor: theme.colors.border,
          background: theme.colors.background,
        }}
      >
        <button
          type="button"
          onClick={goBack}
          className="flex items-center gap-2 -ml-1 px-1.5 py-1 rounded transition-opacity hover:opacity-70 shrink-0"
          style={{ color: theme.colors.textSecondary, cursor: 'pointer' }}
          title={backLabel}
          aria-label={backLabel}
        >
          <ChevronLeft size={16} />
          <span
            style={{
              fontSize: theme.fontSizes[0],
              fontWeight: theme.fontWeights.semibold,
              color: theme.colors.textSecondary,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {label}
          </span>
          {count !== undefined && crumb === undefined && (
            <span
              style={{ fontSize: theme.fontSizes[0], color: theme.colors.textMuted }}
            >
              {count}
            </span>
          )}
        </button>
        {crumb !== undefined && (
          <>
            <ChevronRight
              size={14}
              style={{ color: theme.colors.textMuted, flexShrink: 0 }}
            />
            <span
              className="truncate"
              style={{
                fontSize: theme.fontSizes[1],
                fontWeight: theme.fontWeights.semibold,
                color: theme.colors.text,
              }}
            >
              {crumb}
            </span>
          </>
        )}
      </div>
    );
  }

  return (
    <div
      className={`px-4 border-b sticky top-0 z-10 shrink-0 flex items-center gap-2 ${
        onBack ? 'py-3' : 'py-2'
      }`}
      style={{
        borderColor: theme.colors.border,
        background: theme.colors.background,
      }}
    >
      {onBack ? (
        <>
          <button
            type="button"
            onClick={onBack}
            className="flex items-center justify-center w-6 h-6 -ml-1 rounded transition-opacity hover:opacity-70"
            style={{ color: theme.colors.textSecondary, cursor: 'pointer' }}
            title={`Back to ${label.toLowerCase()}`}
            aria-label={`Back to ${label.toLowerCase()}`}
          >
            <ChevronLeft size={16} />
          </button>
          {backContent}
        </>
      ) : (
        <>
          <span style={{ color: theme.colors.textSecondary }}>{icon}</span>
          <span
            style={{
              fontSize: theme.fontSizes[0],
              fontWeight: theme.fontWeights.semibold,
              color: theme.colors.textSecondary,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {label}
          </span>
          {count !== undefined && (
            <span
              style={{ fontSize: theme.fontSizes[0], color: theme.colors.textMuted }}
            >
              {count}
            </span>
          )}
        </>
      )}
      <button
        type="button"
        onClick={onClose}
        className="ml-auto flex items-center justify-center w-6 h-6 rounded transition-opacity hover:opacity-70"
        style={{ color: theme.colors.textMuted, cursor: 'pointer' }}
        title="Close"
        aria-label="Close"
      >
        <X size={14} />
      </button>
    </div>
  );
};
