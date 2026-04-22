'use client';

import { useEffect, useState, useRef } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { useAuth } from '@/contexts/AuthContext';
import { LogOut, Home, Calendar, User, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FollowsSettingsPanel } from './FollowsSettingsPanel';

interface UserOrganization {
  id: number;
  login: string;
  avatar_url: string;
  description: string | null;
}

export function UserAvatarMenu() {
  const { theme } = useTheme();
  const { user, isAuthenticated, isLoading, login, logout } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [organizations, setOrganizations] = useState<UserOrganization[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(false);
  const [showFollowsSettings, setShowFollowsSettings] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const isHomePage = pathname === '/';

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

  // Fetch organizations when menu opens
  useEffect(() => {
    if (!userMenuOpen || !isAuthenticated || organizations.length > 0) return;

    const fetchOrganizations = async () => {
      setOrgsLoading(true);
      try {
        const response = await fetch('/api/github/user/orgs');
        if (response.ok) {
          const data = await response.json();
          setOrganizations(data.organizations || []);
        }
      } catch (error) {
        console.error('Failed to fetch organizations:', error);
      } finally {
        setOrgsLoading(false);
      }
    };

    fetchOrganizations();
  }, [userMenuOpen, isAuthenticated, organizations.length]);

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
        className="flex items-center justify-center px-3 h-8 rounded-md transition-all hover:opacity-80 text-sm font-medium"
        style={{
          background: theme.colors.primary,
          color: theme.colors.textOnPrimary,
        }}
        title="Login"
      >
        Login
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
          {/* User's profile */}
          {user && (
            <Link
              href={`/${user.login}`}
              className="flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:opacity-80"
              style={{ color: theme.colors.text }}
              onClick={() => setUserMenuOpen(false)}
            >
              <User className="w-4 h-4" />
              Your Profile
            </Link>
          )}
          {/* Home - hide when already on home page */}
          {!isHomePage && (
            <Link
              href="/"
              className="flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:opacity-80"
              style={{ color: theme.colors.text }}
              onClick={() => setUserMenuOpen(false)}
            >
              <Home className="w-4 h-4" />
              Home
            </Link>
          )}
          {/* Organizations */}
          {(organizations.length > 0 || orgsLoading) && (
            <>
              <div
                className="my-1 h-px"
                style={{ background: theme.colors.border }}
              />
              <div
                className="px-3 py-1 text-xs font-medium uppercase tracking-wider"
                style={{ color: theme.colors.textMuted }}
              >
                Organizations
              </div>
              {orgsLoading ? (
                <div
                  className="px-3 py-2 text-sm"
                  style={{ color: theme.colors.textMuted }}
                >
                  Loading...
                </div>
              ) : (
                organizations.map((org) => (
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
                ))
              )}
            </>
          )}
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
          {/* Manage Follows */}
          <button
            onClick={() => {
              setUserMenuOpen(false);
              setShowFollowsSettings(true);
            }}
            className="flex items-center gap-2 px-3 py-2 text-sm w-full transition-colors hover:opacity-80"
            style={{ color: theme.colors.text }}
          >
            <UserPlus className="w-4 h-4" />
            Manage Follows
          </button>
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

      {/* Follows Settings Panel */}
      <FollowsSettingsPanel
        isOpen={showFollowsSettings}
        onClose={() => setShowFollowsSettings(false)}
      />
    </div>
  );
}
