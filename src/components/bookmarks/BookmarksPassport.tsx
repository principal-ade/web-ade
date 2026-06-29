'use client';

import React from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import type { BookmarkRepo, PassportSlots } from './types';
import { REPO_DND_MIME } from './types';
import { PassportStamp } from './PassportStamp';
import { RecentReposTray } from './RecentReposTray';

interface BookmarksPassportProps {
  // Source repos shown in the draggable tray.
  recentRepos: BookmarkRepo[];
  // Optional initial placements, keyed by slot index → repo full_name.
  initialSlots?: PassportSlots;
  // Slots per passport page (page is rendered as COLS × ROWS).
  cols?: number;
  rows?: number;
  pages?: number;
}

export function BookmarksPassport({
  recentRepos,
  initialSlots,
  cols = 2,
  rows = 3,
  pages = 2,
}: BookmarksPassportProps) {
  const { theme } = useTheme();
  const ink = theme.colors.primary;

  const totalSlots = cols * rows * pages;
  const perPage = cols * rows;

  const [slots, setSlots] = React.useState<PassportSlots>(() => {
    const base: PassportSlots = Array.from({ length: totalSlots }, () => null);
    if (initialSlots) {
      initialSlots.slice(0, totalSlots).forEach((v, i) => (base[i] = v ?? null));
    }
    return base;
  });
  const [dragOver, setDragOver] = React.useState<number | null>(null);

  const repoByName = React.useMemo(() => {
    const m = new Map<string, BookmarkRepo>();
    recentRepos.forEach((r) => m.set(r.full_name, r));
    return m;
  }, [recentRepos]);

  const placed = React.useMemo(
    () => new Set(slots.filter((s): s is string => s !== null)),
    [slots],
  );

  const handleDrop = (targetIndex: number, e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    const fullName = e.dataTransfer.getData(REPO_DND_MIME);
    if (!fullName) return;
    const fromSlotRaw = e.dataTransfer.getData('text/x-from-slot');
    const fromSlot = fromSlotRaw === '' ? null : Number(fromSlotRaw);

    setSlots((prev) => {
      const next = [...prev];
      if (fromSlot !== null && !Number.isNaN(fromSlot)) {
        // Moving an existing stamp between slots → swap contents.
        const displaced = next[targetIndex] ?? null;
        next[targetIndex] = fullName;
        next[fromSlot] = displaced;
      } else {
        // New stamp from the tray. If it's already placed elsewhere, move it.
        const existing = next.indexOf(fullName);
        if (existing !== -1) next[existing] = null;
        next[targetIndex] = fullName;
      }
      return next;
    });
  };

  // Faint ruled-paper texture derived from the theme so the page reads as a
  // passport leaf without hardcoding a parchment color.
  const pageBg = `repeating-linear-gradient(0deg, color-mix(in srgb, ${theme.colors.border} 35%, transparent) 0px, color-mix(in srgb, ${theme.colors.border} 35%, transparent) 1px, transparent 1px, transparent 26px), linear-gradient(135deg, ${theme.colors.surface}, ${theme.colors.backgroundSecondary})`;

  const renderPage = (pageIndex: number) => (
    <div
      key={pageIndex}
      style={{
        flex: 1,
        padding: '22px 20px',
        background: pageBg,
        position: 'relative',
        // Inner page shadow toward the spine for the open-book curve.
        boxShadow:
          pageIndex % 2 === 0
            ? `inset -18px 0 24px -18px color-mix(in srgb, ${ink} 45%, transparent)`
            : `inset 18px 0 24px -18px color-mix(in srgb, ${ink} 45%, transparent)`,
      }}
    >
      <div
        style={{
          fontSize: theme.fontSizes[0],
          letterSpacing: '2px',
          color: theme.colors.accent,
          fontWeight: theme.fontWeights.bold,
          textTransform: 'uppercase',
          marginBottom: '14px',
          textAlign: pageIndex % 2 === 0 ? 'left' : 'right',
        }}
      >
        ✦ Visas &amp; Entries — Page {pageIndex + 1} ✦
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
          gap: '16px',
          height: 'calc(100% - 30px)',
        }}
      >
        {Array.from({ length: perPage }, (_, i) => {
          const slotIndex = pageIndex * perPage + i;
          const fullName = slots[slotIndex];
          const repo = fullName ? repoByName.get(fullName) : undefined;
          const isOver = dragOver === slotIndex;
          return (
            <div
              key={slotIndex}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
                if (dragOver !== slotIndex) setDragOver(slotIndex);
              }}
              onDragLeave={() => setDragOver((d) => (d === slotIndex ? null : d))}
              onDrop={(e) => handleDrop(slotIndex, e)}
              style={{
                position: 'relative',
                aspectRatio: '1 / 1',
                borderRadius: theme.radii[2] ?? 10,
                display: 'grid',
                placeItems: 'stretch',
                ...(repo
                  ? {}
                  : {
                      border: `2px dashed ${
                        isOver ? ink : `color-mix(in srgb, ${ink} 28%, transparent)`
                      }`,
                      background: isOver
                        ? `color-mix(in srgb, ${ink} 8%, transparent)`
                        : `color-mix(in srgb, ${theme.colors.surface} 18%, transparent)`,
                      transition: 'background 120ms, border-color 120ms',
                    }),
              }}
            >
              {repo ? (
                <PassportStamp
                  repo={repo}
                  draggableFromSlot={slotIndex}
                  onRemove={() =>
                    setSlots((prev) => {
                      const next = [...prev];
                      next[slotIndex] = null;
                      return next;
                    })
                  }
                />
              ) : (
                <div
                  style={{
                    placeSelf: 'center',
                    textAlign: 'center',
                    color: isOver ? ink : theme.colors.textMuted,
                    fontSize: theme.fontSizes[1],
                    fontWeight: theme.fontWeights.semibold,
                    lineHeight: 1.4,
                    pointerEvents: 'none',
                  }}
                >
                  <div style={{ fontSize: '20px', opacity: 0.5 }}>◍</div>
                  {isOver ? 'Drop to stamp' : 'Empty'}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div
      style={{
        display: 'flex',
        gap: '24px',
        alignItems: 'flex-start',
        padding: '24px',
        background: theme.colors.background,
        minHeight: '100%',
        fontFamily: theme.fonts.body,
      }}
    >
      <RecentReposTray repos={recentRepos} placed={placed} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: '14px',
          }}
        >
          <div>
            <div
              style={{
                fontSize: theme.fontSizes[5],
                fontWeight: theme.fontWeights.bold,
                letterSpacing: '0.5px',
                color: theme.colors.text,
              }}
            >
              Repo Passport
            </div>
            <div style={{ fontSize: theme.fontSizes[1], color: theme.colors.textMuted }}>
              {placed.size}/{totalSlots} entries stamped
            </div>
          </div>
          <div
            style={{
              fontSize: theme.fontSizes[0],
              letterSpacing: '3px',
              color: theme.colors.accent,
              fontWeight: theme.fontWeights.bold,
            }}
          >
            ✈ DEVELOPER EDITION
          </div>
        </div>

        {/* The open passport: a "cover" in the theme's primary wrapping the
            two-page spread. */}
        <div
          style={{
            borderRadius: theme.radii[3] ?? 16,
            padding: '14px',
            background: `linear-gradient(135deg, color-mix(in srgb, ${ink} 80%, #000), ${ink})`,
            boxShadow: theme.shadows[3] ?? '0 24px 50px rgba(0,0,0,0.4)',
          }}
        >
          <div
            style={{
              display: 'flex',
              borderRadius: theme.radii[1] ?? 8,
              overflow: 'hidden',
              position: 'relative',
              minHeight: '520px',
              border: `1px solid color-mix(in srgb, ${theme.colors.accent} 40%, transparent)`,
            }}
          >
            {Array.from({ length: pages }, (_, p) => renderPage(p))}
            {/* Center spine */}
            {pages > 1 && (
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: '50%',
                  width: '14px',
                  transform: 'translateX(-50%)',
                  background: `linear-gradient(90deg, transparent, color-mix(in srgb, ${ink} 28%, transparent), color-mix(in srgb, ${ink} 40%, transparent), color-mix(in srgb, ${ink} 28%, transparent), transparent)`,
                  pointerEvents: 'none',
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
