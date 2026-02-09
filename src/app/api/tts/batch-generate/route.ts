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
import { validateTTSRequest, generateS3Key } from '@/lib/tts/key-generator';
import { fetchTourFromGitHub } from '@/lib/tts/github-fetcher';
import { checkS3Cache, getS3Url, uploadToS3 } from '@/lib/tts/s3-cache';
import { mergeTTSOptions, generateAudio } from '@/lib/tts/elevenlabs-client';
import removeMd from 'remove-markdown';

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

    // Check cache status for all steps in parallel
    const stepPromises = tour.steps.map(async (step) => {
      const s3Key = await generateS3Key(
        body.owner,
        body.repo,
        body.path,
        body.commitSha,
        step.id,
        options
      );

      let cached = await checkS3Cache(s3Key);
      const audioUrl = getS3Url(s3Key);

      // If not cached, generate the audio
      if (!cached) {
        // Use narration if available (pre-written TTS-friendly), otherwise fall back to description or content
        const rawText = step.narration || step.description || step.content || '';

        if (!rawText.trim()) {
          console.warn('[TTS Batch] Skipping step with no text:', step.id);
          // Keep cached=false so status will be 'generating'
        } else {
          console.log('[TTS Batch] Generating audio for step:', step.id);

          try {
            // Strip markdown syntax for TTS (unless using pre-written narration)
            const text = step.narration ? rawText : removeMd(rawText);
            const audioBuffer = await generateAudio(text.trim(), options);
            await uploadToS3(s3Key, audioBuffer);
            cached = true;
            console.log('[TTS Batch] Generated and cached:', step.id);
          } catch (error) {
            console.error('[TTS Batch] Failed to generate step:', step.id, error);
            // Continue with other steps even if one fails
          }
        }
      }

      const status: 'ready' | 'generating' = cached ? 'ready' : 'generating';

      return {
        stepId: step.id,
        audioUrl,
        cached,
        status,
      };
    });

    const steps = await Promise.all(stepPromises);

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
