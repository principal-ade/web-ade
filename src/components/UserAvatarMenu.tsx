'use client';

import { useEffect, useState, useRef } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { useAuth } from '@/contexts/AuthContext';
import { LogOut, User, Github, Building2, Home, FolderOpen } from 'lucide-react';
import Link from 'next/link';

interface Organization {
  id: number;
  login: string;
  avatar_url: string;
  description: string | null;
}

export function UserAvatarMenu() {
  const { theme } = useTheme();
  const { user, isAuthenticated, isLoading, login, logout } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);

  // Close user menu when clicking outside
  useEffect(() => {
    if (!userMenuOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [userMenuOpen]);

  // Fetch user's organizations when authenticated
  useEffect(() => {
    if (!isAuthenticated || !user) {
      setOrganizations([]);
      return;
    }

    fetch('/api/github/user/orgs')
      .then((res) => res.json())
      .then((data) => {
        if (data.organizations) {
          setOrganizations(data.organizations);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch organizations:', err);
      });
  }, [isAuthenticated, user]);

  if (isLoading) {
    return (
      <div className="text-sm" style={{ color: theme.colors.textMuted }}>
        Loading...
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <button
        onClick={() => login()}
        className="flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80"
        style={{
          background: theme.colors.primary,
          color: theme.colors.background,
        }}
        title="Login"
      >
        <User size={16} />
      </button>
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
          {/* Library */}
          <Link
            href="/library"
            className="flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:opacity-80"
            style={{ color: theme.colors.text }}
            onClick={() => setUserMenuOpen(false)}
          >
            <FolderOpen className="w-4 h-4" />
            Library
          </Link>
          <div
            className="my-1 h-px"
            style={{ background: theme.colors.border }}
          />
          {/* Your Repositories */}
          <Link
            href={`/${user.login}`}
            className="flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:opacity-80"
            style={{ color: theme.colors.text }}
            onClick={() => setUserMenuOpen(false)}
          >
            <User className="w-4 h-4" />
            Your Repositories
          </Link>
          <a
            href={`https://github.com/${user.login}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:opacity-80"
            style={{ color: theme.colors.text }}
            onClick={() => setUserMenuOpen(false)}
          >
            <Github className="w-4 h-4" />
            Open in GitHub
          </a>

          {/* Organizations Section */}
          {organizations.length > 0 && (
            <>
              <div
                className="my-1 h-px"
                style={{ background: theme.colors.border }}
              />
              <div
                className="px-3 py-1.5 text-xs font-medium"
                style={{ color: theme.colors.textMuted }}
              >
                <div className="flex items-center gap-1.5">
                  <Building2 className="w-3 h-3" />
                  Organizations
                </div>
              </div>
              {organizations.map((org) => (
                <Link
                  key={org.id}
                  href={`/${org.login}`}
                  className="flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:opacity-80"
                  style={{ color: theme.colors.text }}
                  onClick={() => setUserMenuOpen(false)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={org.avatar_url}
                    alt={org.login}
                    className="w-4 h-4 rounded"
                  />
                  {org.login}
                </Link>
              ))}
            </>
          )}

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
