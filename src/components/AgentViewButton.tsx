'use client';

/**
 * Title-bar button that opens the {@link AgentViewModal} for a given page.
 * Owns its own open/close state so a header can drop it in with just the
 * canonical `path` of the page being viewed.
 *
 * Two shapes: the default labelled pill (matches the "Share With Agent"
 * button) and `iconOnly` for headers that only have room for a 32px icon
 * slot (e.g. the repo overview header).
 */

import { useState } from 'react';
import { Bot } from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';
import { AgentViewModal } from '@/components/AgentViewModal';

interface AgentViewButtonProps {
  /** Canonical page path to preview, e.g. `/owner/repo`, `/trail/{id}`. */
  path: string;
  /** Render as a bare 32px icon button instead of a labelled pill. */
  iconOnly?: boolean;
  /** Override the visible/aria label. */
  label?: string;
}

export function AgentViewButton({
  path,
  iconOnly = false,
  label = 'Agent View',
}: AgentViewButtonProps) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <>
      {iconOnly ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80"
          style={{ color: theme.colors.text, cursor: 'pointer' }}
          title="See what an agent sees"
          aria-label="See what an agent sees"
        >
          <Bot className="w-5 h-5" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 px-3 h-8 rounded-md text-sm font-medium transition-all hover:opacity-80"
          style={{
            background: 'transparent',
            color: theme.colors.text,
            border: `1px solid ${theme.colors.border}`,
            fontFamily: theme.fonts.body,
            cursor: 'pointer',
          }}
          title="See what an agent sees"
          aria-label="See what an agent sees"
        >
          <Bot className="w-4 h-4" />
          <span>{label}</span>
        </button>
      )}
      {open && <AgentViewModal path={path} onClose={() => setOpen(false)} />}
    </>
  );
}
