/**
 * AuthContext - Client-side authentication state management
 *
 * IMPORTANT: This context does NOT store tokens!
 * Tokens are in HTTP-only cookies, inaccessible to JavaScript.
 * This context only manages user profile data and authentication status.
 */

'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

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
  login: () => void;
  logout: () => Promise<void>;
  fetchUser: () => Promise<void>;
}

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
   */
  const login = useCallback(() => {
    window.location.href = '/api/auth/login';
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
   * Auto-refresh tokens every 50 minutes
   * (Tokens expire in 60 minutes, refresh proactively)
   */
  useEffect(() => {
    if (!state.isAuthenticated) return;

    const refreshInterval = setInterval(
      async () => {
        try {
          const response = await fetch('/api/auth/refresh', { method: 'POST' });

          if (!response.ok) {
            console.error('Token refresh failed, logging out');
            await logout();
          } else {
            console.log('Tokens refreshed successfully');
          }
        } catch (error) {
          console.error('Token refresh error:', error);
        }
      },
      50 * 60 * 1000 // 50 minutes
    );

    return () => clearInterval(refreshInterval);
  }, [state.isAuthenticated, logout]);

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
