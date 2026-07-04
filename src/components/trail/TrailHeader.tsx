'use client';

import Link from 'next/link';
import { Check, Github, MessageSquareOff, MessageSquarePlus, Search, Stamp, Terminal, Undo2, X } from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookmarkButton } from '@/components/BookmarkButton';
import { AgentViewButton } from '@/components/AgentViewButton';
import { UserAvatarMenu } from '@/components/UserAvatarMenu';
import { RepoInfoModal } from '@/components/trail/RepoInfoModal';
import { RepoSearchBar } from '@/components/RepoSearchBar';
import { SignOffStampAnimation } from '@/components/trail/LgtmStamp';
import { useAuth } from '@/contexts/AuthContext';

const COPY_FEEDBACK_MS = 1500;
const LGTM_ANIMATION_MS = 1100;
const LGTM_HOLD_MS = 600;
const lgtmStorageKey = (trailId: string) => `trail-lgtm:${trailId}`;

const buildAgentCommand = (trailId: string) =>
  `npx -y @principal-ai/principal-view-cli@latest trail ${trailId}`;

interface TrailHeaderProps {
  owner: string;
  repo: string;
  trailId: string;
  /**
   * Transient status text shown centered in the header, e.g.
   * "Saved in this browser only. Sign in to share." Caller controls
   * the lifecycle (set + clear); the header just renders it with a
   * fade transition so it appears smoothly.
   */
  statusMessage?: string | null;
  /**
   * Current bookmarked state. When `onToggleBookmark` is provided the header
   * renders a bookmark button; otherwise the slot is omitted.
   */
  bookmarked?: boolean;
  /**
   * Forward click on the bookmark button. Parent owns the optimistic update
   * and the API call (or, for signed-out callers, the sign-in redirect).
   */
  onToggleBookmark?: () => void;
  /** Disable the bookmark button while a previous toggle is in flight. */
  bookmarkToggleInFlight?: boolean;
  /**
   * Whether the viewer has any notes attached. Drives the stamp label —
   * "LGTM" when empty, "Reviewed" once the user has left at least one note.
   */
  hasNotes?: boolean;
  /**
   * Owner-only toggle: when true, render the "Allow anonymous notes"
   * control. Parent computes ownership (`user.id === entry.createdBy.githubId`).
   */
  showAnonNotesToggle?: boolean;
  /** Current value of the trail's `allowAnonNotes` flag. */
  allowAnonNotes?: boolean;
  /** Click handler — parent owns the PATCH + optimistic update. */
  onToggleAnonNotes?: () => void;
  /** Disable the toggle while a previous PATCH is in flight. */
  anonNotesToggleInFlight?: boolean;
  /**
   * When provided, the header renders a close button so the caller can
   * dismiss the trail viewer. Placement is controlled by
   * `closeButtonPosition`.
   */
  onClose?: () => void;
  /**
   * Where the close button sits. `'left'` (default) replaces the
   * Principal AI brand at the start of the header; `'right'` drops it
   * at the end of the right-side action group, useful when the
   * surrounding surface already has its own brand on the left.
   */
  closeButtonPosition?: 'left' | 'right';
  // ----- Section visibility (all default to true). Embedded surfaces
  // pass `false` to drop the parts they don't want, e.g. the topic page
  // hides bookmark/stamp/agent/github when surfacing a trail inline.
  /** Bookmark button (desktop). Defaults to true; ignored when no `onToggleBookmark`. */
  showBookmark?: boolean;
  /** LGTM / Reviewed stamp button (mobile). Defaults to true. */
  showStamp?: boolean;
  /** "Share With Agent" copy-to-clipboard button (desktop). Defaults to true. */
  showAgentCopy?: boolean;
  /** "Agent View" preview button (desktop) — opens what an agent sees. Defaults to true. */
  showAgentView?: boolean;
  /** GitHub repo link icon (desktop). Defaults to true. */
  showGithubLink?: boolean;
  /**
   * Avatar menu / login button at the end of the right-side action
   * group. Defaults to true so standalone surfaces (e.g. /trail/[id],
   * legacy PR view) get auth chrome for free. Embedded surfaces whose
   * outer chrome already renders one (e.g. topic page's TrailHeaderLite)
   * pass `false` to avoid a duplicate.
   */
  showUserMenu?: boolean;
  /**
   * How the owner segment of the breadcrumb renders. `'name'` (default)
   * shows the owner login as text; `'avatar'` swaps it for the owner's
   * GitHub avatar so the embedded header stays compact.
   */
  ownerDisplay?: 'name' | 'avatar';
}

export function TrailHeader({
  owner,
  repo,
  trailId,
  statusMessage,
  bookmarked,
  onToggleBookmark,
  bookmarkToggleInFlight,
  hasNotes,
  showAnonNotesToggle,
  allowAnonNotes,
  onToggleAnonNotes,
  anonNotesToggleInFlight,
  onClose,
  closeButtonPosition = 'left',
  showBookmark = true,
  showStamp = true,
  showAgentCopy = true,
  showAgentView = true,
  showGithubLink = true,
  showUserMenu = true,
  ownerDisplay = 'name',
}: TrailHeaderProps) {
  const closeOnLeft = !!onClose && closeButtonPosition === 'left';
  const closeOnRight = !!onClose && closeButtonPosition === 'right';
  const stampLabel = hasNotes ? 'Reviewed' : 'LGTM';
  const { theme } = useTheme();
  const { isAuthenticated } = useAuth();
  const [copied, setCopied] = useState(false);
  const [repoInfoOpen, setRepoInfoOpen] = useState(false);
  // Mobile: the repo opener collapses into a "Search GitHub" button that opens
  // a full-screen search sheet (the header is too cramped for the input).
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [lgtmSigned, setLgtmSigned] = useState(false);
  const [lgtmAnimating, setLgtmAnimating] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lgtmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (lgtmTimeoutRef.current) clearTimeout(lgtmTimeoutRef.current);
    };
  }, []);

  // Restore prior sign-off from localStorage. Keyed per trail so different
  // trails track independently. Wrapped in try/catch because storage can
  // be disabled (private mode, quota, etc.) and we'd rather render than
  // throw.
  useEffect(() => {
    try {
      setLgtmSigned(localStorage.getItem(lgtmStorageKey(trailId)) === '1');
    } catch {
      setLgtmSigned(false);
    }
  }, [trailId]);

  const handleCopyAgent = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(buildAgentCommand(trailId));
      setCopied(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    } catch {
      // clipboard may be denied — fail quietly; user can refresh and retry
    }
  }, [trailId]);

  const handleLgtm = useCallback(() => {
    if (lgtmAnimating) return;
    // Toggle off if already signed — keeps the testing loop quick without
    // needing devtools to clear localStorage.
    if (lgtmSigned) {
      try {
        localStorage.removeItem(lgtmStorageKey(trailId));
      } catch {
        // ignore
      }
      setLgtmSigned(false);
      return;
    }
    setLgtmAnimating(true);
    try {
      localStorage.setItem(lgtmStorageKey(trailId), '1');
    } catch {
      // ignore
    }
    if (lgtmTimeoutRef.current) clearTimeout(lgtmTimeoutRef.current);
    lgtmTimeoutRef.current = setTimeout(() => {
      setLgtmSigned(true);
      setLgtmAnimating(false);
    }, LGTM_ANIMATION_MS + LGTM_HOLD_MS);
  }, [lgtmAnimating, lgtmSigned, trailId]);

  return (
    <header
      className="border-b px-4 flex items-center gap-2 flex-shrink-0 relative"
      style={{
        background: theme.colors.surface,
        borderColor: theme.colors.border,
        paddingTop: 'calc(var(--safe-top) + 0.5rem)',
        paddingBottom: '0.5rem',
      }}
    >
      <div className="hidden md:flex items-center gap-2 min-w-0 flex-1">
        {closeOnLeft ? (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center w-8 h-8 rounded-md transition-opacity hover:opacity-80"
            style={{
              background: 'transparent',
              color: theme.colors.text,
              border: `1px solid ${theme.colors.border}`,
              cursor: 'pointer',
            }}
            aria-label="Close trail viewer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        ) : !onClose ? (
          <Link
            href="/"
            className="text-xl font-bold transition-opacity hover:opacity-80"
            style={{ fontFamily: theme.fonts.body, textDecoration: 'none' }}
          >
            <span style={{ color: theme.colors.text }}>Principal</span>{' '}
            <span style={{ color: theme.colors.primary }}>AI</span>
          </Link>
        ) : null}

        {/* Leading separator only matters when something rendered before
            it — when onClose lives on the right, the breadcrumb begins
            with the owner so we drop this slash. */}
        {!closeOnRight && (
          <span
            className="mx-2"
            style={{ color: theme.colors.textMuted }}
            aria-hidden="true"
          >
            /
          </span>
        )}

        {ownerDisplay === 'avatar' ? (
          <Link
            href={`/${owner}`}
            className="flex-shrink-0 transition-opacity hover:opacity-80"
            title={owner}
            aria-label={owner}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://github.com/${owner}.png?size=64`}
              alt=""
              width={28}
              height={28}
              className="rounded-full"
              style={{ border: `1px solid ${theme.colors.border}` }}
            />
          </Link>
        ) : (
          <Link
            href={`/${owner}`}
            className="text-base font-semibold transition-opacity hover:opacity-80 truncate"
            style={{
              fontFamily: theme.fonts.body,
              color: theme.colors.text,
              textDecoration: 'none',
            }}
          >
            {owner}
          </Link>
        )}
        {ownerDisplay !== 'avatar' && (
          <span style={{ color: theme.colors.textMuted }} aria-hidden="true">
            /
          </span>
        )}
        <Link
          href={`/${owner}/${repo}`}
          className="text-base font-semibold transition-opacity hover:opacity-80 truncate"
          style={{
            fontFamily: theme.fonts.body,
            color: theme.colors.text,
            textDecoration: 'none',
          }}
        >
          {repo}
        </Link>
      </div>

      <div className="flex md:hidden items-center gap-2 min-w-0 flex-1">
        {closeOnLeft && (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center w-8 h-8 rounded-md flex-shrink-0 transition-opacity hover:opacity-80"
            style={{
              background: 'transparent',
              color: theme.colors.text,
              border: `1px solid ${theme.colors.border}`,
              cursor: 'pointer',
            }}
            aria-label="Close trail viewer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setRepoInfoOpen(true)}
          className="flex items-center gap-2 min-w-0 flex-1 transition-opacity hover:opacity-80 bg-transparent border-0 p-0 text-left"
          style={{ cursor: 'pointer', color: 'inherit' }}
          aria-label={`Show info for ${owner}/${repo}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://github.com/${owner}.png?size=64`}
            alt=""
            width={32}
            height={32}
            className="rounded-full flex-shrink-0"
            style={{ border: `1px solid ${theme.colors.border}` }}
          />
          <span
            className="text-base font-semibold truncate"
            style={{
              fontFamily: theme.fonts.body,
              color: theme.colors.text,
            }}
          >
            {repo}
          </span>
        </button>
      </div>

      {/*
        Centered status slot. Absolute-positioned so it occupies the
        true visual center of the header rather than being squeezed
        between left and right groups. `pointer-events-none` lets users
        click through onto whatever sits behind it (no behavior here,
        but keeps interactions feeling snappy when text is animating
        in/out).
      */}
      <div
        className="absolute left-1/2 -translate-x-1/2 hidden md:flex items-center justify-center pointer-events-none"
        style={{
          top: 'calc(var(--safe-top) + 0.5rem)',
          bottom: '0.5rem',
        }}
        aria-live="polite"
      >
        <span
          className="px-3 py-1 rounded-md text-sm font-medium transition-opacity duration-300 whitespace-nowrap"
          style={{
            opacity: statusMessage ? 1 : 0,
            background: theme.colors.backgroundSecondary,
            color: theme.colors.text,
            border: `1px solid ${theme.colors.border}`,
            fontFamily: theme.fonts.body,
          }}
        >
          {statusMessage ?? ' '}
        </span>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Mobile: a compact button that opens the full-screen search sheet
            (the inline opener is hidden below md, mirroring the repo page). */}
        <button
          type="button"
          onClick={() => setMobileSearchOpen(true)}
          className="md:hidden flex items-center gap-1.5 h-8 px-2.5 rounded-md transition-opacity hover:opacity-80"
          style={{
            color: theme.colors.text,
            background: theme.colors.background,
            border: `1px solid ${theme.colors.border}`,
            fontSize: theme.fontSizes[1],
          }}
          aria-label="Search GitHub"
        >
          <Search className="w-4 h-4" />
          Search GitHub
        </button>

        {showStamp && isAuthenticated && (lgtmSigned ? (
          <button
            type="button"
            onClick={handleLgtm}
            disabled={lgtmAnimating}
            className="flex md:hidden items-center justify-center bg-transparent"
            style={{
              border: 'none',
              padding: '4px 10px',
              gap: 18,
              cursor: lgtmAnimating ? 'wait' : 'pointer',
              // Wrapper keeps the click target rectangular while the
              // inner stamp can rotate without skewing layout.
            }}
            aria-label={`Remove ${stampLabel} sign-off`}
            aria-pressed
            title={`Tap to undo ${stampLabel}`}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '3px 10px',
                border: `2px double ${theme.colors.success}`,
                borderRadius: 4,
                color: theme.colors.success,
                fontFamily: theme.fonts.monospace,
                fontWeight: 700,
                fontSize: 13,
                letterSpacing: '0.12em',
                transform: 'rotate(-8deg)',
                background: `color-mix(in srgb, ${theme.colors.background} 65%, transparent)`,
                userSelect: 'none',
              }}
            >
              {stampLabel}
            </span>
            <Undo2
              className="w-4 h-4"
              style={{ color: theme.colors.textMuted, opacity: 0.8 }}
              aria-hidden
            />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleLgtm}
            disabled={lgtmAnimating}
            className="flex md:hidden items-center gap-1.5 px-3 h-8 rounded-md text-sm font-semibold transition-all hover:opacity-90"
            style={{
              background: 'transparent',
              color: theme.colors.success,
              border: `1px solid ${theme.colors.success}`,
              fontFamily: theme.fonts.monospace,
              letterSpacing: '0.08em',
              cursor: lgtmAnimating ? 'wait' : 'pointer',
              opacity: lgtmAnimating ? 0.7 : 1,
            }}
            aria-label="Stamp sign-off"
            aria-pressed={false}
          >
            <Stamp className="w-4 h-4" />
            <span>Stamp</span>
          </button>
        ))}

        {showAnonNotesToggle && onToggleAnonNotes && (
          <button
            type="button"
            onClick={onToggleAnonNotes}
            disabled={anonNotesToggleInFlight}
            className="hidden md:flex items-center gap-1.5 px-3 h-8 rounded-md text-sm font-medium transition-all hover:opacity-80"
            style={{
              background: allowAnonNotes ? theme.colors.primary : 'transparent',
              color: allowAnonNotes
                ? theme.colors.background
                : theme.colors.text,
              border: `1px solid ${
                allowAnonNotes ? theme.colors.primary : theme.colors.border
              }`,
              fontFamily: theme.fonts.body,
              cursor: anonNotesToggleInFlight ? 'wait' : 'pointer',
              opacity: anonNotesToggleInFlight ? 0.7 : 1,
            }}
            aria-pressed={!!allowAnonNotes}
            title={
              allowAnonNotes
                ? 'Anonymous viewers can post notes on this trail. Click to disable.'
                : 'Click to allow anonymous viewers to post notes on this trail.'
            }
          >
            {allowAnonNotes ? (
              <MessageSquarePlus className="w-4 h-4" />
            ) : (
              <MessageSquareOff className="w-4 h-4" />
            )}
            <span>{allowAnonNotes ? 'Anon notes on' : 'Anon notes off'}</span>
          </button>
        )}

        {showBookmark && onToggleBookmark && (
          <div className="hidden md:flex">
            <BookmarkButton
              bookmarked={!!bookmarked}
              onClick={onToggleBookmark}
              disabled={bookmarkToggleInFlight}
            />
          </div>
        )}

        {showAgentCopy && (
          <button
            type="button"
            onClick={handleCopyAgent}
            className="hidden md:flex items-center gap-1.5 px-3 h-8 rounded-md text-sm font-medium transition-all hover:opacity-80"
            style={{
              background: copied ? theme.colors.primary : 'transparent',
              color: copied ? theme.colors.background : theme.colors.text,
              border: `1px solid ${copied ? theme.colors.primary : theme.colors.border}`,
              fontFamily: theme.fonts.body,
              cursor: 'pointer',
            }}
            title={`Copies: ${buildAgentCommand(trailId)}`}
            aria-label="Copy CLI command for agents"
          >
            {copied ? (
              <Check className="w-4 h-4" />
            ) : (
              <Terminal className="w-4 h-4" />
            )}
            <span>{copied ? 'Copied' : 'Share With Agent'}</span>
          </button>
        )}

        {showAgentView && (
          <div className="hidden md:flex">
            <AgentViewButton path={`/trail/${trailId}`} />
          </div>
        )}

        {showGithubLink && (
          <a
            href={`https://github.com/${owner}/${repo}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80"
            style={{ color: theme.colors.text }}
            title={`Open ${owner}/${repo} on GitHub`}
            aria-label={`Open ${owner}/${repo} on GitHub`}
          >
            <Github className="w-5 h-5" />
          </a>
        )}

        {showUserMenu && (
          <div className="hidden md:block">
            <UserAvatarMenu />
          </div>
        )}

        {closeOnRight && (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center w-8 h-8 rounded-md flex-shrink-0 transition-opacity hover:opacity-80"
            style={{
              background: 'transparent',
              color: theme.colors.text,
              border: `1px solid ${theme.colors.border}`,
              cursor: 'pointer',
            }}
            aria-label="Close trail viewer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {repoInfoOpen && (
        <RepoInfoModal
          owner={owner}
          repo={repo}
          onClose={() => setRepoInfoOpen(false)}
        />
      )}

      {/* Mobile GitHub search sheet — full-screen so the search input + results
          have room; reuses the shared RepoSearchBar (navigates on select).
          Portaled to document.body at the same z-tier as the sibling modals
          so the trail explorer can't paint above it. */}
      {mobileSearchOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="md:hidden fixed inset-0 flex flex-col"
            style={{
              background: theme.colors.background,
              color: theme.colors.text,
              zIndex: 2147483000,
            }}
          >
            <div
              className="flex items-center justify-between gap-3 px-4 h-14 border-b shrink-0"
              style={{
                borderColor: `color-mix(in srgb, ${theme.colors.border} 70%, transparent)`,
              }}
            >
              <span
                className="font-semibold"
                style={{ fontSize: theme.fontSizes[3], fontFamily: theme.fonts.body }}
              >
                Search GitHub
              </span>
              <button
                type="button"
                onClick={() => setMobileSearchOpen(false)}
                className="inline-flex items-center justify-center rounded-md p-2 transition-opacity hover:opacity-80"
                style={{ color: theme.colors.textMuted }}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4">
              <RepoSearchBar
                excludeFullName={`${owner}/${repo}`}
                inputWidthClass="w-full"
                autoFocus
              />
            </div>
          </div>,
          document.body,
        )}

      {lgtmAnimating &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            aria-hidden
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 2147483646,
              pointerEvents: 'none',
              background: `color-mix(in srgb, ${theme.colors.background} 35%, transparent)`,
              animation: 'lgtm-overlay-fade 1700ms ease-out both',
            }}
          >
            <style>{`
              @keyframes lgtm-overlay-fade {
                0%   { opacity: 0; }
                20%  { opacity: 1; }
                80%  { opacity: 1; }
                100% { opacity: 0; }
              }
            `}</style>
            <SignOffStampAnimation theme={theme} text={stampLabel} size={220} />
          </div>,
          document.body,
        )}
    </header>
  );
}
