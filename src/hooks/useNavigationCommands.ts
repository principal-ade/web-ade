'use client';

/**
 * Shared navigation commands for the command palette
 * Used by both GlobalCommandPalette and EditorLayout
 */

import { useCallback, useMemo } from 'react';
import type { QuickCommand } from '@principal-ade/panel-layouts';

/**
 * Parse a GitHub URL and extract owner/repo
 * Supports:
 * - https://github.com/owner/repo
 * - github.com/owner/repo
 * - owner/repo
 */
export function parseGitHubUrl(input: string): string | null {
  let cleaned = input.trim();
  cleaned = cleaned.replace(/^https?:\/\//, '');
  cleaned = cleaned.replace(/^www\./, '');
  cleaned = cleaned.replace(/^github\.com\//, '');
  cleaned = cleaned.replace(/\/(tree|blob|issues|pulls|actions|settings|releases|wiki|security|pulse|graphs).*$/, '');
  cleaned = cleaned.replace(/\.git$/, '');
  cleaned = cleaned.replace(/\/$/, '');

  const match = cleaned.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  return match ? `${match[1]}/${match[2]}` : null;
}

/**
 * Navigation quick commands definition
 */
export const navigationQuickCommands: QuickCommand[] = [
  {
    name: 'home',
    description: 'Navigate to homepage',
    category: 'Navigation',
    aliases: ['h'],
  },
  {
    name: 'repos',
    description: 'Open repos',
    category: 'Navigation',
    aliases: ['c', 'col', 'collections'],
  },
  {
    name: 'repo',
    description: 'Navigate to a repository',
    category: 'Navigation',
    aliases: ['r', 'repository'],
    args: [
      {
        name: 'repository',
        description: 'Repository in owner/name format',
        required: true,
      },
    ],
  },
  {
    name: 'owner',
    description: 'Navigate to an owner or organization page',
    category: 'Navigation',
    aliases: ['o', 'org'],
    args: [
      {
        name: 'owner',
        description: 'GitHub username or organization',
        required: true,
      },
    ],
  },
  {
    name: 'github',
    description: 'Open a GitHub URL',
    category: 'Navigation',
    aliases: ['gh', 'url'],
    args: [
      {
        name: 'url',
        description: 'GitHub URL or owner/repo',
        required: true,
      },
    ],
  },
  {
    name: 'back',
    description: 'Go back in browser history',
    category: 'Navigation',
    aliases: ['b'],
  },
  {
    name: 'login',
    description: 'Sign in with GitHub',
    category: 'Account',
    aliases: ['signin', 'auth'],
  },
  {
    name: 'logout',
    description: 'Sign out',
    category: 'Account',
    aliases: ['signout'],
  },
];

/**
 * Hook that provides navigation commands and handler for the command palette
 * @param additionalOptions - Optional additional options for repositories/owners autocomplete
 */
export function useNavigationCommands(additionalOptions?: {
  repositories?: string[];
  owners?: string[];
}) {
  // Build quick commands with optional autocomplete data
  const quickCommands = useMemo(() => {
    if (!additionalOptions) return navigationQuickCommands;

    return navigationQuickCommands.map(cmd => {
      if (cmd.name === 'repo' && additionalOptions.repositories?.length) {
        return {
          ...cmd,
          args: cmd.args?.map(arg => ({
            ...arg,
            options: additionalOptions.repositories,
          })),
        };
      }
      if (cmd.name === 'owner' && additionalOptions.owners?.length) {
        return {
          ...cmd,
          args: cmd.args?.map(arg => ({
            ...arg,
            options: additionalOptions.owners,
          })),
        };
      }
      return cmd;
    });
  }, [additionalOptions]);

  // Handle navigation command execution
  // The palette passes args as { args: ['value1', 'value2'] } format
  const handleExecuteTool = useCallback(
    async (name: string, rawArgs: Record<string, unknown>): Promise<unknown> => {
      const argsArray = (rawArgs.args as string[]) || [];
      const firstArg = argsArray[0] || '';

      const navigate = (url: string) => {
        window.location.href = url;
      };

      switch (name) {
        case 'home':
          navigate('/');
          return { success: true };

        case 'repos':
        case 'collections':
        case 'col':
        case 'c':
          navigate('/repos');
          return { success: true };

        case 'repo':
        case 'repository':
          if (firstArg && firstArg.includes('/')) {
            navigate(`/${firstArg}`);
            return { success: true };
          }
          return { success: false, error: 'Invalid repository format. Use owner/repo' };

        case 'owner':
        case 'org':
          if (firstArg) {
            navigate(`/${firstArg}`);
            return { success: true };
          }
          return { success: false, error: 'Owner name required' };

        case 'github':
        case 'gh':
        case 'url':
          if (firstArg) {
            const parsed = parseGitHubUrl(firstArg);
            if (parsed) {
              navigate(`/${parsed}`);
              return { success: true };
            }
            return { success: false, error: 'Could not parse GitHub URL' };
          }
          return { success: false, error: 'URL required' };

        case 'back':
          window.history.back();
          return { success: true };

        case 'login':
        case 'signin':
        case 'auth': {
          const redirect = window.location.pathname + window.location.search;
          navigate(`/api/auth/login?redirect=${encodeURIComponent(redirect)}`);
          return { success: true };
        }

        case 'logout':
        case 'signout':
          navigate('/api/auth/logout');
          return { success: true };

        default:
          return { success: false, error: `Unknown command: ${name}` };
      }
    },
    []
  );

  return {
    quickCommands,
    handleExecuteTool,
  };
}
