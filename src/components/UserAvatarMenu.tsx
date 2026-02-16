'use client';

import { useEffect, useState, useRef } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { useAuth } from '@/contexts/AuthContext';
import { LogOut, Home, FolderOpen, Calendar, User, LogIn } from 'lucide-react';
import Link from 'next/link';

export function UserAvatarMenu() {
  const { theme } = useTheme();
  const { user, isAuthenticated, isLoading, login, logout } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [loggedOutMenuOpen, setLoggedOutMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close user menu when clicking outside
  useEffect(() => {
    if (!userMenuOpen && !loggedOutMenuOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
        setLoggedOutMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [userMenuOpen, loggedOutMenuOpen]);

  if (isLoading) {
    return (
      <div className="text-sm" style={{ color: theme.colors.textMuted }}>
        Loading...
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="relative" ref={userMenuRef}>
        <button
          onClick={() => setLoggedOutMenuOpen(!loggedOutMenuOpen)}
          className="flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80"
          style={{
            background: theme.colors.primary,
            color: theme.colors.textOnPrimary,
          }}
          title="User Menu"
        >
          <User size={16} />
        </button>

        {/* Dropdown Menu */}
        {loggedOutMenuOpen && (
          <div
            className="absolute right-0 top-full mt-1 py-1 rounded-md shadow-lg border min-w-[160px] z-50"
            style={{
              background: theme.colors.background,
              borderColor: theme.colors.border,
            }}
          >
            {/* Login */}
            <button
              onClick={() => {
                setLoggedOutMenuOpen(false);
                login();
              }}
              className="flex items-center gap-2 px-3 py-2 text-sm w-full transition-colors hover:opacity-80"
              style={{ color: theme.colors.text }}
            >
              <LogIn className="w-4 h-4" />
              Login
            </button>

            {/* Home */}
            <Link
              href="/"
              className="flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:opacity-80"
              style={{ color: theme.colors.text }}
              onClick={() => setLoggedOutMenuOpen(false)}
            >
              <Home className="w-4 h-4" />
              Home
            </Link>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={userMenuRef}>
      <button
        onClick={() => setUserMenuOpen(!userMenuOpen)}
        className="flex items-center rounded-full transition-all hover:opacity-80"
      >
        {user.avatar_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatar_url}
            alt={user.name || user.login}
            className="w-8 h-8 rounded-full"
          />
        )}
      </button>

      {/* Dropdown Menu */}
      {userMenuOpen && (
        <div
          className="absolute right-0 top-full mt-1 py-1 rounded-md shadow-lg border min-w-[160px] z-50"
          style={{
            background: theme.colors.background,
            borderColor: theme.colors.border,
          }}
        >
          {/* Home */}
          <Link
            href="/"
            className="flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:opacity-80"
            style={{ color: theme.colors.text }}
            onClick={() => setUserMenuOpen(false)}
          >
            <Home className="w-4 h-4" />
            Home
          </Link>
          {/* Worlds */}
          <Link
            href="/worlds"
            className="flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:opacity-80"
            style={{ color: theme.colors.text }}
            onClick={() => setUserMenuOpen(false)}
          >
            <FolderOpen className="w-4 h-4" />
            Worlds
          </Link>
          {/* Feed */}
          <Link
            href="/activity"
            className="flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:opacity-80"
            style={{ color: theme.colors.text }}
            onClick={() => setUserMenuOpen(false)}
          >
            <Calendar className="w-4 h-4" />
            Feed
          </Link>
          <div
            className="my-1 h-px"
            style={{ background: theme.colors.border }}
          />
          <button
            onClick={() => {
              setUserMenuOpen(false);
              logout();
            }}
            className="flex items-center gap-2 px-3 py-2 text-sm w-full transition-colors hover:opacity-80"
            style={{ color: theme.colors.error }}
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
