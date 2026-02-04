/**
 * Text-to-Speech Type Definitions
 *
 * Interfaces and types for the TTS system using ElevenLabs API with S3 caching.
 */

/**
 * Request to generate TTS audio for a single tour step
 */
export interface TTSGenerateRequest {
  owner: string;
  repo: string;
  path: string;
  commitSha: string;
  stepId: string;
  voice?: string;
  speed?: number;
}

/**
 * Request to batch generate TTS audio for all steps in a tour
 */
export interface TTSBatchGenerateRequest {
  owner: string;
  repo: string;
  path: string;
  commitSha: string;
  voice?: string;
  speed?: number;
}

/**
 * Response from TTS generation endpoint
 */
export interface TTSGenerateResponse {
  audioUrl: string;
  cached: boolean;
  duration?: number;
  generatedAt: string;
}

/**
 * Response from batch generation endpoint
 */
export interface TTSBatchResponse {
  tourId: string;
  steps: Array<{
    stepId: string;
    audioUrl: string;
    cached: boolean;
    status: 'ready' | 'generating' | 'failed';
    error?: string;
  }>;
  totalSteps: number;
  cachedSteps: number;
  generatingSteps: number;
}

/**
 * Introduction tour structure (from @industry-theme/file-city-panel)
 */
export interface IntroductionTour {
  id: string;
  title: string;
  description: string;
  steps: IntroductionTourStep[];
  [key: string]: unknown;
}

/**
 * Individual step in a tour
 */
export interface IntroductionTourStep {
  id: string;
  title: string;
  description?: string;
  content?: string;
  [key: string]: unknown;
}

/**
 * TTS generation options
 */
export interface TTSOptions {
  voice: string;
  speed: number;
  model: string;
}

/**
 * Error codes for TTS operations
 */
export enum TTSErrorCode {
  TOUR_NOT_FOUND = 'TOUR_NOT_FOUND',
  STEP_NOT_FOUND = 'STEP_NOT_FOUND',
  INVALID_TOUR_FORMAT = 'INVALID_TOUR_FORMAT',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  ELEVENLABS_ERROR = 'ELEVENLABS_ERROR',
  S3_ERROR = 'S3_ERROR',
  INVALID_REQUEST = 'INVALID_REQUEST',
}

/**
 * Extended error type with additional TTS-specific fields
 */
export interface TTSError extends Error {
  code: TTSErrorCode;
  retryAfter?: number;
  stepId?: string;
}
