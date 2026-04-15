/**
 * AuthContext - Client-side authentication state management
 *
 * IMPORTANT: This context does NOT store tokens!
 * Tokens are in HTTP-only cookies, inaccessible to JavaScript.
 * This context only manages user profile data and authentication status.
 *
 * Token refresh strategy (modeled after electron-app):
 * - Proactive refresh: Checks token status every 60 seconds
 * - Refreshes when within 5 minutes of expiry (not waiting until expired)
 * - Retry logic with exponential backoff on failures
 * - Graceful degradation: Only logs out after multiple consecutive failures
 */

'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getDeviceId } from '@/lib/device-id';

/**
 * User data structure (NO TOKENS!)
 */
export interface User {
  login: string;
  email: string;
  name: string;
  id: number;
  avatar_url?: string;
}

/**
 * Auth state interface
 */
interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

/**
 * Auth context methods
 */
interface AuthContextType extends AuthState {
  login: (redirectTo?: string) => void;
  logout: () => Promise<void>;
  fetchUser: () => Promise<void>;
  /** Manually trigger a token refresh */
  refreshTokens: () => Promise<boolean>;
}

/**
 * Token status response from /api/auth/token-status
 */
interface TokenStatus {
  authenticated: boolean;
  expiresAt: number | null;
  expiresIn: number | null;
  shouldRefresh: boolean;
}

/**
 * Refresh configuration constants
 */
const REFRESH_CHECK_INTERVAL = 60 * 1000; // Check every 60 seconds
const REFRESH_WINDOW = 5 * 60 * 1000; // Refresh when within 5 minutes of expiry
const MAX_RETRY_ATTEMPTS = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * AuthProvider component
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
  });

  // Track consecutive refresh failures for graceful degradation
  const refreshFailureCount = useRef(0);
  // Prevent concurrent refresh attempts
  const isRefreshing = useRef(false);

  /**
   * Fetches current user from /api/auth/me
   * Cookies are automatically sent with the request
   */
  const fetchUser = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me');

      if (response.ok) {
        const data = await response.json();
        setState({
          user: data.user,
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
        // Not authenticated
        setState({
          user: null,
          isAuthenticated: false,
          isLoading: false,
        });
      }
    } catch (error) {
      console.error('Failed to fetch user:', error);
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  }, []);

  /**
   * Initiates login by redirecting to /api/auth/login
   * @param redirectTo - Optional URL to redirect to after login (defaults to current page)
   */
  const login = useCallback((redirectTo?: string) => {
    const redirect = redirectTo ?? window.location.pathname + window.location.search;
    const loginUrl = `/api/auth/login?redirect=${encodeURIComponent(redirect)}`;
    window.location.href = loginUrl;
  }, []);

  /**
   * Logs out by calling /api/auth/logout
   */
  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      });
      // Redirect to home
      window.location.href = '/';
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }, []);

  /**
   * Attempts to refresh tokens with retry logic and exponential backoff
   * @returns true if refresh succeeded, false otherwise
   */
  const refreshTokens = useCallback(async (): Promise<boolean> => {
    // Prevent concurrent refresh attempts
    if (isRefreshing.current) {
      return false;
    }

    isRefreshing.current = true;

    try {
      // Get device ID for device-specific token management
      const deviceId = getDeviceId();

      for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
        try {
          const response = await fetch('/api/auth/refresh', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ device_id: deviceId }),
          });

          if (response.ok) {
            console.log('Tokens refreshed successfully');
            refreshFailureCount.current = 0; // Reset failure count on success
            isRefreshing.current = false;
            return true;
          }

          // If we get a 401, the refresh token is invalid - no point retrying
          if (response.status === 401) {
            console.error('Refresh token expired or invalid');
            break;
          }

          // For other errors, wait and retry
          if (attempt < MAX_RETRY_ATTEMPTS - 1) {
            const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt);
            console.log(`Refresh attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        } catch (error) {
          // Network error - wait and retry
          if (attempt < MAX_RETRY_ATTEMPTS - 1) {
            const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt);
            console.log(`Refresh network error, retrying in ${delay}ms...`, error);
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }

      // All retries failed
      refreshFailureCount.current++;
      console.error(
        `Token refresh failed after ${MAX_RETRY_ATTEMPTS} attempts. ` +
          `Consecutive failures: ${refreshFailureCount.current}`
      );

      // Only logout after 3 consecutive refresh cycles fail
      // This prevents logging out due to temporary network issues
      if (refreshFailureCount.current >= 3) {
        console.error('Too many consecutive refresh failures, logging out');
        await logout();
      }

      isRefreshing.current = false;
      return false;
    } catch (error) {
      console.error('Unexpected refresh error:', error);
      isRefreshing.current = false;
      return false;
    }
  }, [logout]);

  /**
   * Checks token status and refreshes proactively if needed
   */
  const checkAndRefreshTokens = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/token-status');

      if (!response.ok) {
        return;
      }

      const status: TokenStatus = await response.json();

      if (!status.authenticated) {
        // Token completely gone, update state
        setState((prev) => {
          if (prev.isAuthenticated) {
            return { ...prev, isAuthenticated: false, user: null };
          }
          return prev;
        });
        return;
      }

      // Proactively refresh if within 5-minute window
      if (status.shouldRefresh || (status.expiresIn !== null && status.expiresIn < REFRESH_WINDOW)) {
        console.log(
          `Token expires in ${Math.round((status.expiresIn || 0) / 1000)}s, refreshing proactively...`
        );
        await refreshTokens();
      }
    } catch (error) {
      // Network error checking status - don't log out, just skip this check
      console.error('Failed to check token status:', error);
    }
  }, [refreshTokens]);

  /**
   * Background token validation and proactive refresh
   * Runs every 60 seconds when authenticated
   */
  useEffect(() => {
    if (!state.isAuthenticated) return;

    // Check immediately on mount
    void checkAndRefreshTokens();

    // Then check every 60 seconds
    const intervalId = setInterval(() => {
      void checkAndRefreshTokens();
    }, REFRESH_CHECK_INTERVAL);

    return () => clearInterval(intervalId);
  }, [state.isAuthenticated, checkAndRefreshTokens]);

  /**
   * Fetch user on mount
   */
  useEffect(() => {
    void fetchUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: AuthContextType = {
    ...state,
    login,
    logout,
    fetchUser,
    refreshTokens,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * useAuth hook - Access authentication state and methods
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
