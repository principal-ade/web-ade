/**
 * useAuthenticatedFetch - A fetch wrapper that handles 401 responses
 *
 * When a request returns 401, this hook will:
 * 1. Attempt to refresh the token
 * 2. Retry the original request if refresh succeeds
 * 3. Redirect to login if refresh fails
 *
 * Usage:
 *   const { authFetch } = useAuthenticatedFetch();
 *   const response = await authFetch('/api/some-endpoint');
 */

'use client';

import { useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface AuthFetchOptions extends RequestInit {
  /** Skip the 401 retry logic (useful for auth endpoints themselves) */
  skipAuthRetry?: boolean;
}

export function useAuthenticatedFetch() {
  const { refreshTokens, isAuthenticated } = useAuth();
  const isRetrying = useRef(false);

  const authFetch = useCallback(
    async (input: RequestInfo | URL, init?: AuthFetchOptions): Promise<Response> => {
      const { skipAuthRetry, ...fetchInit } = init || {};

      const response = await fetch(input, fetchInit);

      // If not a 401 or we should skip retry, return as-is
      if (response.status !== 401 || skipAuthRetry) {
        return response;
      }

      // Prevent concurrent retry attempts
      if (isRetrying.current) {
        return response;
      }

      // Don't retry if not authenticated (prevents infinite loops)
      if (!isAuthenticated) {
        return response;
      }

      console.log('Received 401, attempting token refresh...');
      isRetrying.current = true;

      try {
        const refreshed = await refreshTokens();

        if (refreshed) {
          // Token refreshed successfully, retry the original request
          console.log('Token refreshed, retrying original request...');
          isRetrying.current = false;
          return fetch(input, fetchInit);
        } else {
          // Refresh failed, user will be logged out by refreshTokens()
          console.error('Token refresh failed on 401 response');
          isRetrying.current = false;
          return response;
        }
      } catch (error) {
        console.error('Error during 401 retry:', error);
        isRetrying.current = false;
        return response;
      }
    },
    [refreshTokens, isAuthenticated]
  );

  return { authFetch };
}
