/**
 * GitHub Tour Fetcher
 *
 * CRITICAL SECURITY COMPONENT - implements zero-trust architecture.
 * Never accepts arbitrary text from clients. Always fetches tour content
 * from GitHub to prevent abuse of ElevenLabs API quota.
 */

import { getGitHubToken } from '@/lib/auth/cookies';
import { IntroductionTour, TTSErrorCode, TTSError } from './types';
import removeMd from 'remove-markdown';

/**
 * Normalizes text for TTS by removing problematic characters
 *
 * - Removes backticks used for inline code (e.g., "`package/`" → "package/")
 * - Removes @ symbols from scoped packages (e.g., "@scope/package" → "scope package")
 * - Replaces forward slashes in paths with spaces for better pronunciation
 *
 * @param text - Text to normalize
 * @returns Normalized text suitable for TTS
 */
export function normalizeTextForTTS(text: string): string {
  return text
    // Remove backticks (inline code markers)
    .replace(/`/g, '')
    // Remove @ symbols (scoped packages, path aliases)
    .replace(/@/g, '')
    // Replace path-like structures (word/word/) with spaces
    // This handles cases like "src/components/" → "src components"
    .replace(/(\w+)\/+/g, '$1 ')
    // Clean up multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fetches and validates tour from GitHub
 *
 * Implements zero-trust security model by fetching tour content directly
 * from GitHub instead of accepting client-provided text.
 *
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param path - Path to tour file in repository
 * @param commitSha - Git commit SHA for specific version
 * @returns Validated tour object
 * @throws Error with TTSErrorCode on failure
 */
export async function fetchTourFromGitHub(
  owner: string,
  repo: string,
  path: string,
  commitSha: string
): Promise<IntroductionTour> {
  // Construct raw GitHub URL
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${commitSha}/${path}`;

  // Get GitHub token (may be null for public repos)
  const userToken = await getGitHubToken();
  const token = userToken || process.env.GITHUB_PUBLIC_PAT || null;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'WebADE-TTS/1.0',
  };

  if (token) {
    headers['Authorization'] = `token ${token}`;
  }

  try {
    const response = await fetch(url, {
      headers,
      // Cache for 5 minutes (tours rarely change for same commitSha)
      next: { revalidate: 300 },
    });

    if (response.status === 404) {
      throw new Error(TTSErrorCode.TOUR_NOT_FOUND);
    }

    if (!response.ok) {
      console.error('[GitHub Fetcher] HTTP error:', {
        status: response.status,
        statusText: response.statusText,
        url,
      });
      throw new Error(TTSErrorCode.TOUR_NOT_FOUND);
    }

    const tour = await response.json();

    // Validate tour structure
    if (!tour || typeof tour !== 'object') {
      console.error('[GitHub Fetcher] Invalid tour: not an object');
      throw new Error(TTSErrorCode.INVALID_TOUR_FORMAT);
    }

    if (!tour.id || typeof tour.id !== 'string') {
      console.error('[GitHub Fetcher] Invalid tour: missing or invalid id');
      throw new Error(TTSErrorCode.INVALID_TOUR_FORMAT);
    }

    if (!Array.isArray(tour.steps) || tour.steps.length === 0) {
      console.error('[GitHub Fetcher] Invalid tour: steps must be non-empty array');
      throw new Error(TTSErrorCode.INVALID_TOUR_FORMAT);
    }

    // Validate each step has required fields
    for (const step of tour.steps) {
      if (!step.id || typeof step.id !== 'string') {
        console.error('[GitHub Fetcher] Invalid step: missing or invalid id');
        throw new Error(TTSErrorCode.INVALID_TOUR_FORMAT);
      }
    }

    return tour as IntroductionTour;
  } catch (error) {
    // Re-throw TTS error codes as-is
    if (
      error instanceof Error &&
      Object.values(TTSErrorCode).includes(error.message as TTSErrorCode)
    ) {
      throw error;
    }

    // Log and wrap unexpected errors
    console.error('[GitHub Fetcher] Unexpected error:', error);
    throw new Error(TTSErrorCode.TOUR_NOT_FOUND);
  }
}

/**
 * Finds step in tour and returns its description
 *
 * Extracts and validates the text content for TTS generation.
 * Prioritizes description field, falls back to content field.
 *
 * @param tour - Tour object
 * @param stepId - Step ID to find
 * @returns Step description text
 * @throws Error with TTSErrorCode if step not found or invalid
 */
export function getStepDescription(tour: IntroductionTour, stepId: string): string {
  const step = tour.steps.find((s) => s.id === stepId);

  if (!step) {
    const error = new Error(TTSErrorCode.STEP_NOT_FOUND) as TTSError;
    error.code = TTSErrorCode.STEP_NOT_FOUND;
    error.stepId = stepId;
    throw error;
  }

  // Try narration first (pre-written TTS-friendly), then description, then content
  const rawText = step.narration || step.description || step.content || '';

  if (!rawText || rawText.trim().length === 0) {
    console.error('[GitHub Fetcher] Step has no description:', {
      tourId: tour.id,
      stepId,
    });
    throw new Error('Step has no description or content');
  }

  // Strip markdown syntax for TTS (unless using pre-written narration)
  let plainText = step.narration ? rawText : removeMd(rawText);

  // Normalize text for TTS (remove trailing slashes, clean up paths)
  plainText = normalizeTextForTTS(plainText);

  const trimmedDescription = plainText.trim();

  // Validate content length (max 5000 characters per spec)
  if (trimmedDescription.length > 5000) {
    console.error('[GitHub Fetcher] Description too long:', {
      tourId: tour.id,
      stepId,
      length: trimmedDescription.length,
    });
    throw new Error('Step description exceeds 5000 characters');
  }

  return trimmedDescription;
}
