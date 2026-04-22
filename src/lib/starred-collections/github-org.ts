/**
 * GitHub Organization Membership Checking for Starred Collections
 *
 * Handles checking if a user is a member of a GitHub organization.
 * Used for authorizing access to org-owned collections.
 */

import { Octokit } from '@octokit/rest';
import { CollectionError, ErrorCodes } from './types';

/**
 * Checks if the authenticated user is an active member of the specified organization
 *
 * @param orgLogin - GitHub organization login
 * @param token - GitHub access token
 * @returns true if user is an active member, false otherwise
 * @throws {CollectionError} if GitHub API fails (rate limit, network error, etc.)
 */
export async function isOrgMember(
  orgLogin: string,
  token: string
): Promise<boolean> {
  try {
    const octokit = new Octokit({ auth: token });

    // Check membership status for the authenticated user
    // This endpoint returns 204 if the user is a public member
    // Returns 404 if not a member or if membership is private
    // We need to use getMembershipForAuthenticatedUser instead
    const { data } = await octokit.orgs.getMembershipForAuthenticatedUser({
      org: orgLogin,
    });

    // User is an active member if state is 'active'
    // State can be 'active' or 'pending' (pending invitation)
    return data.state === 'active';
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'status' in error) {
      const status = error.status as number;

      // Not a member or organization doesn't exist
      if (status === 404) {
        return false;
      }

      // Rate limit or forbidden (scopes issue)
      if (status === 403) {
        console.error('[GitHub Org] Rate limit or permissions issue:', {
          orgLogin,
          error: error instanceof Error ? error.message : String(error),
        });
        throw new CollectionError(
          'GitHub API rate limit exceeded or insufficient permissions',
          502,
          ErrorCodes.ORG_MEMBERSHIP_CHECK_FAILED
        );
      }

      // Unauthorized - invalid token
      if (status === 401) {
        throw new CollectionError(
          'GitHub authentication failed',
          401,
          ErrorCodes.NOT_AUTHENTICATED
        );
      }
    }

    // Generic error
    console.error('[GitHub Org] Membership check failed:', {
      orgLogin,
      error: error instanceof Error ? error.message : String(error),
    });

    throw new CollectionError(
      'Failed to check organization membership',
      502,
      ErrorCodes.ORG_MEMBERSHIP_CHECK_FAILED
    );
  }
}

/**
 * Gets all organizations the authenticated user is a member of
 *
 * @param token - GitHub access token
 * @returns Array of organization logins
 * @throws {CollectionError} if GitHub API fails
 */
export async function getUserOrgs(token: string): Promise<string[]> {
  try {
    const octokit = new Octokit({ auth: token });

    // Get all orgs the user is a member of
    const { data: orgs } = await octokit.orgs.listForAuthenticatedUser();

    // Return array of org logins
    return orgs.map((org) => org.login);
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'status' in error) {
      const status = error.status as number;

      // Rate limit or forbidden
      if (status === 403) {
        console.error('[GitHub Org] Rate limit or permissions issue:', {
          error: error instanceof Error ? error.message : String(error),
        });
        throw new CollectionError(
          'GitHub API rate limit exceeded or insufficient permissions',
          502,
          ErrorCodes.ORG_MEMBERSHIP_CHECK_FAILED
        );
      }

      // Unauthorized - invalid token
      if (status === 401) {
        throw new CollectionError(
          'GitHub authentication failed',
          401,
          ErrorCodes.NOT_AUTHENTICATED
        );
      }
    }

    // Generic error
    console.error('[GitHub Org] Failed to fetch user orgs:', {
      error: error instanceof Error ? error.message : String(error),
    });

    throw new CollectionError(
      'Failed to fetch user organizations',
      502,
      ErrorCodes.ORG_MEMBERSHIP_CHECK_FAILED
    );
  }
}
