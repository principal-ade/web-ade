'use client';

/**
 * GlobalCommandPalette - A reusable command palette with navigation support
 *
 * Quick Commands:
 * - /home - Navigate to homepage
 * - /repo <owner/name> - Navigate to repository
 * - /owner <username> - Navigate to owner page
 * - /collection <id> - Navigate to collection
 * - /github <url> - Parse GitHub URL and navigate to repo
 * - /login - Sign in with GitHub
 * - /logout - Sign out
 *
 * Supports dynamic autocomplete for collections, repositories, and owners.
 */

import { useEffect, useMemo } from 'react';
import {
  AgentCommandPalette,
  useAgentCommandPalette,
} from '@principal-ade/panel-layouts';
import { PanelEventBus } from '@principal-ade/panel-framework-core';
import type { PanelEventEmitter } from '@principal-ade/panel-framework-core';
import { useNavigationCommands } from '@/hooks/useNavigationCommands';

/** Data for autocomplete suggestions */
export interface CommandPaletteData {
  /** Available collections with id and name */
  collections?: Array<{ id: string; name: string }>;
  /** Recent or available repositories (owner/repo format) */
  repositories?: string[];
  /** Recent or available owners/organizations */
  owners?: string[];
}

interface GlobalCommandPaletteProps {
  /** Event emitter from PanelProvider. If not provided, creates its own. */
  events?: PanelEventEmitter;
  /** Callback when a natural language command is submitted (for AI integration) */
  onNaturalLanguageSubmit?: (query: string) => void;
  /** Initial suggestions to show in the palette */
  initialSuggestions?: string[];
  /** Placeholder text */
  placeholder?: string;
  /** Data for autocomplete (collections, repos, owners) */
  autocompleteData?: CommandPaletteData;
  /** Whether AI agent is available (defaults to false for standalone) */
  agentAvailable?: boolean;
}

export function GlobalCommandPalette({
  events: externalEvents,
  onNaturalLanguageSubmit,
  initialSuggestions = [
    '/home',
    '/library',
    '/repo',
    '/collection',
    '/github',
    '/login',
  ],
  placeholder = 'Type a command (/) or ask a question...',
  autocompleteData = {},
  agentAvailable = false,
}: GlobalCommandPaletteProps) {
  // Create internal events if none provided
  const internalEvents = useMemo(() => new PanelEventBus(), []);
  const events = externalEvents || internalEvents;

  // Get navigation commands and handler from shared hook
  const { quickCommands, handleExecuteTool } = useNavigationCommands(autocompleteData);

  // Initialize Agent Command Palette (Cmd+Shift+P to open)
  const agentPalette = useAgentCommandPalette({
    events,
    keyboard: { key: 'p', metaKey: true, shiftKey: true, altKey: false },
    config: {
      placeholder,
      autoCloseDelay: 2000,
    },
    initialSuggestions,
    agentAvailable,
    quickCommands,
    onExecuteTool: handleExecuteTool,
  });

  // Handle natural language submissions (AI mode)
  useEffect(() => {
    if (!events || !onNaturalLanguageSubmit) return;

    const unsubscribe = events.on('agent-command-palette:submit', (event) => {
      const payload = event.payload as { query: string; mode: string };
      // Only handle natural language mode - quick commands use onExecuteTool callback
      if (payload.mode === 'natural' && payload.query) {
        onNaturalLanguageSubmit(payload.query);
      }
    });

    return () => unsubscribe();
  }, [events, onNaturalLanguageSubmit]);

  // Listen for completion/error events to update palette status
  useEffect(() => {
    if (!events) return;

    const unsubscribers = [
      events.on('command-palette:complete', () => {
        if (agentPalette.isOpen) {
          agentPalette.setStatus('complete');
          agentPalette.setAgentResponse('Done');
        }
      }),
      events.on('command-palette:error', (event) => {
        if (agentPalette.isOpen) {
          const payload = event.payload as { error?: string };
          agentPalette.setStatus('error');
          agentPalette.setAgentResponse(payload.error || 'An error occurred');
        }
      }),
      // Also listen for Gemini events for backward compatibility
      events.on('gemini:message-complete', () => {
        if (agentPalette.isOpen) {
          agentPalette.setStatus('complete');
          agentPalette.setAgentResponse('Done');
        }
      }),
      events.on('gemini:error', (event) => {
        if (agentPalette.isOpen) {
          const payload = event.payload as { error?: string };
          agentPalette.setStatus('error');
          agentPalette.setAgentResponse(payload.error || 'An error occurred');
        }
      }),
    ];

    return () => unsubscribers.forEach((unsub) => unsub());
  }, [events, agentPalette]);

  return (
    <AgentCommandPalette
      palette={agentPalette}
      config={{
        placeholder,
      }}
    />
  );
}
