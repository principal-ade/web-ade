/**
 * POST /api/tts/batch-generate
 *
 * Pre-fetches audio URLs for all steps in a tour.
 * Used by TourPlayer on mount to check cache status and generate missing audio.
 *
 * - Checks cache for all steps
 * - Generates audio for uncached steps
 * - Returns URLs once all audio is ready
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  TTSBatchGenerateRequest,
  TTSBatchResponse,
  TTSErrorCode,
} from '@/lib/tts/types';
import { validateTTSRequest, generateS3Key, generateLegacyS3Key } from '@/lib/tts/key-generator';
import { fetchTourFromGitHub } from '@/lib/tts/github-fetcher';
import { checkS3CacheWithFallback, getS3Url, uploadToS3 } from '@/lib/tts/s3-cache';
import { mergeTTSOptions, generateAudio } from '@/lib/tts/elevenlabs-client';
import removeMd from 'remove-markdown';

/**
 * Normalizes text for TTS by removing problematic characters
 */
function normalizeTextForTTS(text: string): string {
  return text
    .replace(/(\w+)\/+/g, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Add CORS headers to response
 */
function addCorsHeaders(response: NextResponse): NextResponse {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return response;
}

/**
 * Handle OPTIONS requests for CORS preflight
 */
export async function OPTIONS() {
  return addCorsHeaders(new NextResponse(null, { status: 200 }));
}

/**
 * Batch check cache status for all steps in a tour
 *
 * Returns URLs and cache status for each step without generating audio.
 * This allows the client to:
 * 1. Pre-load cached audio URLs immediately
 * 2. Lazily generate uncached audio as needed (via /api/tts/generate)
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as TTSBatchGenerateRequest;

    // Validate request (reuse single step validation with dummy stepId)
    const validationError = validateTTSRequest({
      ...body,
      stepId: 'dummy', // Required for validation, but not used
    });

    // Ignore stepId-specific validation errors
    if (validationError && !validationError.includes('stepId')) {
      return addCorsHeaders(
        NextResponse.json(
          {
            error: TTSErrorCode.INVALID_REQUEST,
            message: validationError,
          },
          { status: 400 }
        )
      );
    }

    // Merge user options with defaults
    const options = mergeTTSOptions({
      voice: body.voice,
      speed: body.speed,
    });

    // Fetch tour from GitHub
    const tour = await fetchTourFromGitHub(
      body.owner,
      body.repo,
      body.path,
      body.commitSha
    );

    console.log('[TTS Batch] Processing tour:', {
      tourId: tour.id,
      totalSteps: tour.steps.length,
    });

    // Generate audio for steps sequentially to maintain context continuity
    const steps: {
      stepId: string;
      audioUrl: string;
      cached: boolean;
      status: 'ready' | 'generating';
    }[] = [];

    let previousText: string | undefined;

    for (const step of tour.steps) {
      // Get step text first - we need it for the content-based key
      const rawText = step.narration || step.description || step.content || '';

      if (!rawText.trim()) {
        console.warn('[TTS Batch] Skipping step with no text:', step.id);
        steps.push({
          stepId: step.id,
          audioUrl: '',
          cached: false,
          status: 'generating',
        });
        continue;
      }

      // Normalize text for TTS
      let text = step.narration ? rawText : removeMd(rawText);
      text = normalizeTextForTTS(text);
      const trimmedText = text.trim();

      // Generate both content-based and legacy keys
      const contentKey = await generateS3Key(
        body.owner,
        body.repo,
        trimmedText,
        options
      );

      const legacyKey = await generateLegacyS3Key(
        body.owner,
        body.repo,
        body.path,
        body.commitSha,
        step.id,
        options
      );

      // Check cache with fallback to legacy key
      const cacheResult = await checkS3CacheWithFallback(contentKey, legacyKey);
      let cached = cacheResult.cached;
      const audioUrl = getS3Url(cacheResult.key);

      if (cacheResult.isLegacy) {
        console.log('[TTS Batch] Using legacy cached audio:', step.id);
      }

      // If not cached, generate the audio
      if (!cached) {
        console.log('[TTS Batch] Generating audio for step:', step.id, {
          withContext: !!previousText,
        });

        try {
          // Pass previous step's text for contextual continuity
          const audioBuffer = await generateAudio(trimmedText, options, previousText);
          // Always upload to content-based key for new audio
          await uploadToS3(contentKey, audioBuffer);
          cached = true;

          console.log('[TTS Batch] Generated and cached:', step.id);
        } catch (error) {
          console.error('[TTS Batch] Failed to generate step:', step.id, error);
          // Continue with other steps even if one fails
        }
      }

      // Store this text for the next step's context
      previousText = trimmedText;

      const status: 'ready' | 'generating' = cached ? 'ready' : 'generating';

      steps.push({
        stepId: step.id,
        audioUrl: cached ? audioUrl : getS3Url(contentKey),
        cached,
        status,
      });
    }

    const cachedSteps = steps.filter((s) => s.cached).length;
    const generatingSteps = steps.filter((s) => !s.cached).length;

    console.log('[TTS Batch] Generation complete:', {
      tourId: tour.id,
      totalSteps: steps.length,
      cachedSteps,
      generatingSteps,
      cacheHitRate: `${((cachedSteps / steps.length) * 100).toFixed(1)}%`,
    });

    const response: TTSBatchResponse = {
      tourId: tour.id,
      steps,
      totalSteps: steps.length,
      cachedSteps,
      generatingSteps,
    };

    return addCorsHeaders(
      NextResponse.json(response, {
        headers: {
          // Short cache for batch metadata (1 minute)
          // The actual audio URLs have 1-year cache
          'Cache-Control': 'public, max-age=60',
        },
      })
    );
  } catch (error) {
    console.error('[TTS Batch] Error:', error);

    // Handle specific TTS errors
    if (error instanceof Error) {
      const errorCode = error.message as TTSErrorCode;

      if (errorCode === TTSErrorCode.TOUR_NOT_FOUND) {
        return addCorsHeaders(
          NextResponse.json(
            {
              error: errorCode,
              message: 'Tour file not found at specified path',
            },
            { status: 404 }
          )
        );
      }

      if (errorCode === TTSErrorCode.INVALID_TOUR_FORMAT) {
        return addCorsHeaders(
          NextResponse.json(
            {
              error: errorCode,
              message: 'Tour file has invalid format',
            },
            { status: 400 }
          )
        );
      }
    }

    // Generic error response
    return addCorsHeaders(
      NextResponse.json(
        { error: 'INTERNAL_ERROR', message: 'Failed to batch generate' },
        { status: 500 }
      )
    );
  }
}
