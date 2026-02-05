/**
 * S3 Key Generation and Validation Utilities
 *
 * Generates cache keys for TTS audio files and validates requests.
 */

import { TTSGenerateRequest, TTSOptions } from './types';

/**
 * Generates SHA-256 hash of content for cache keys
 *
 * @param content - String to hash
 * @returns First 12 characters of hex-encoded SHA-256 hash
 */
export async function generateContentHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex.substring(0, 12);
}

/**
 * Generates S3 key for TTS audio file
 *
 * Pattern: /tts-audio/{owner}/{repo}/{file-hash}/{step-id}-{options-hash}.mp3
 *
 * - file-hash: First 12 chars of SHA-256(path:commitSha) - ensures cache invalidation
 * - options-hash: First 12 chars of SHA-256(voice-speed-model) - separates different audio variants
 *
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param path - Path to tour file in repo
 * @param commitSha - Git commit SHA
 * @param stepId - Tour step ID
 * @param options - TTS options (voice, speed)
 * @returns S3 object key
 */
export async function generateS3Key(
  owner: string,
  repo: string,
  path: string,
  commitSha: string,
  stepId: string,
  options: TTSOptions
): Promise<string> {
  // Hash file location (path + commitSha) for cache invalidation when content changes
  const fileHash = await generateContentHash(`${path}:${commitSha}`);

  // Hash options (voice + speed + model) for different audio variants
  const optionsString = `${options.voice}-${options.speed}-${options.model}`;
  const optionsHash = await generateContentHash(optionsString);

  return `tts-audio/${owner}/${repo}/${fileHash}/${stepId}-${optionsHash}.mp3`;
}

/**
 * Validates TTS request parameters
 *
 * Ensures all required fields are present and correctly formatted.
 *
 * @param req - TTS generation request
 * @returns Error message if validation fails, null if valid
 */
export function validateTTSRequest(req: TTSGenerateRequest): string | null {
  // Check required fields
  if (!req.owner || !req.repo || !req.path || !req.commitSha || !req.stepId) {
    return 'Missing required parameters: owner, repo, path, commitSha, and stepId are required';
  }

  // Validate owner format (alphanumeric, hyphens, underscores)
  if (!/^[a-zA-Z0-9_-]+$/.test(req.owner)) {
    return 'Invalid owner format: must contain only alphanumeric characters, hyphens, and underscores';
  }

  // Validate repo format (alphanumeric, hyphens, underscores, dots)
  if (!/^[a-zA-Z0-9_.-]+$/.test(req.repo)) {
    return 'Invalid repo format: must contain only alphanumeric characters, hyphens, underscores, and dots';
  }

  // Validate commit SHA format (7-40 hexadecimal characters)
  if (!/^[a-f0-9]{7,40}$/.test(req.commitSha)) {
    return 'Invalid commit SHA format: must be 7-40 hexadecimal characters';
  }

  // Validate speed if provided (0.5 to 2.0)
  if (req.speed !== undefined && (req.speed < 0.5 || req.speed > 2.0)) {
    return 'Invalid speed: must be between 0.5 and 2.0';
  }

  return null;
}
