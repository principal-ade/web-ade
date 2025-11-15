'use client';

import { useTheme } from '@principal-ade/industry-theme';
import { useAuth } from '@/contexts/AuthContext';
import { LogIn, LogOut } from 'lucide-react';
import Link from 'next/link';

export function EditorHeader() {
  const { theme } = useTheme();
  const { user, isAuthenticated, isLoading, login, logout } = useAuth();

  return (
    <header
      className="h-12 flex items-center justify-between px-4 border-b"
      style={{
        background: theme.colors.surface,
        borderColor: theme.colors.border,
      }}
    >
      <div className="flex items-center gap-2">
        <Link href="/" className="text-lg font-semibold transition-opacity hover:opacity-80 cursor-pointer" style={{ color: theme.colors.text }}>
          Principal ADE Web
        </Link>
      </div>

      <div className="flex items-center gap-3">
        {isLoading ? (
          <div className="text-sm" style={{ color: theme.colors.textMuted }}>
            Loading...
          </div>
        ) : isAuthenticated && user ? (
          <>
            <div className="flex items-center gap-2">
              {user.avatar_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatar_url}
                  alt={user.name}
                  className="w-6 h-6 rounded-full"
                />
              )}
              <span className="text-sm" style={{ color: theme.colors.text }}>
                {user.name || user.login}
              </span>
            </div>
            <button
              onClick={logout}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all hover:opacity-80"
              style={{
                background: theme.colors.secondary,
                color: theme.colors.text,
              }}
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </>
        ) : (
          <button
            onClick={login}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all hover:opacity-80"
            style={{
              background: theme.colors.primary,
              color: theme.colors.background,
            }}
          >
            <LogIn className="w-4 h-4" />
            Login
          </button>
        )}
      </div>
    </header>
  );
}
