/**
 * POST /api/tts/generate
 *
 * Generates or retrieves cached TTS audio for a single tour step.
 *
 * Security: Implements zero-trust architecture by fetching tour content
 * from GitHub. Never accepts arbitrary text from clients.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  TTSGenerateRequest,
  TTSGenerateResponse,
  TTSErrorCode,
} from '@/lib/tts/types';
import { validateTTSRequest, generateS3Key } from '@/lib/tts/key-generator';
import {
  fetchTourFromGitHub,
  getStepDescription,
} from '@/lib/tts/github-fetcher';
import { checkS3Cache, uploadToS3, getS3Url } from '@/lib/tts/s3-cache';
import { generateAudio, mergeTTSOptions } from '@/lib/tts/elevenlabs-client';

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
 * Generate TTS audio for a tour step
 *
 * Flow:
 * 1. Validate request parameters
 * 2. Generate S3 key from request
 * 3. Check if audio exists in S3 cache
 * 4. If cached: Return URL immediately
 * 5. If not cached:
 *    - Fetch tour from GitHub
 *    - Validate step exists
 *    - Generate audio via ElevenLabs
 *    - Upload to S3
 *    - Return URL
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as TTSGenerateRequest;

    // Validate request parameters
    const validationError = validateTTSRequest(body);
    if (validationError) {
      return addCorsHeaders(
        NextResponse.json(
          { error: TTSErrorCode.INVALID_REQUEST, message: validationError },
          { status: 400 }
        )
      );
    }

    // Merge user options with defaults
    const options = mergeTTSOptions({
      voice: body.voice,
      speed: body.speed,
    });

    // Generate S3 key for this specific audio file
    const s3Key = await generateS3Key(
      body.owner,
      body.repo,
      body.path,
      body.commitSha,
      body.stepId,
      options
    );

    // Check S3 cache first (fast path)
    const isCached = await checkS3Cache(s3Key);

    if (isCached) {
      // Cache hit - return immediately
      const audioUrl = getS3Url(s3Key);
      const response: TTSGenerateResponse = {
        audioUrl,
        cached: true,
        generatedAt: new Date().toISOString(),
      };

      return addCorsHeaders(
        NextResponse.json(response, {
          headers: {
            'Cache-Control': 'public, max-age=31536000', // 1 year
          },
        })
      );
    }

    // Cache miss - need to generate audio
    console.log('[TTS Generate] Cache miss, generating audio:', {
      owner: body.owner,
      repo: body.repo,
      path: body.path,
      stepId: body.stepId,
    });

    // Fetch tour from GitHub (security layer)
    const tour = await fetchTourFromGitHub(
      body.owner,
      body.repo,
      body.path,
      body.commitSha
    );

    // Extract and validate step description
    const stepDescription = getStepDescription(tour, body.stepId);

    // Generate audio using ElevenLabs
    const startTime = Date.now();
    const audioBuffer = await generateAudio(stepDescription, options);
    const generationTime = Date.now() - startTime;

    console.log('[TTS Generate] Audio generated:', {
      tourId: tour.id,
      stepId: body.stepId,
      textLength: stepDescription.length,
      generationTimeMs: generationTime,
    });

    // Upload to S3 for caching
    const audioUrl = await uploadToS3(s3Key, audioBuffer, {
      'tour-id': tour.id,
      'step-id': body.stepId,
      'generation-time-ms': generationTime.toString(),
      'text-length': stepDescription.length.toString(),
    });

    const response: TTSGenerateResponse = {
      audioUrl,
      cached: false,
      generatedAt: new Date().toISOString(),
    };

    return addCorsHeaders(
      NextResponse.json(response, {
        headers: {
          'Cache-Control': 'public, max-age=31536000', // 1 year
        },
      })
    );
  } catch (error) {
    console.error('[TTS Generate] Error:', error);

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

      if (errorCode === TTSErrorCode.STEP_NOT_FOUND) {
        return addCorsHeaders(
          NextResponse.json(
            {
              error: errorCode,
              message: `Step ${(error as any).stepId || 'unknown'} not found in tour`,
            },
            { status: 404 }
          )
        );
      }

      if (errorCode === TTSErrorCode.RATE_LIMIT_EXCEEDED) {
        return addCorsHeaders(
          NextResponse.json(
            {
              error: errorCode,
              message: 'ElevenLabs API rate limit exceeded',
              retryAfter: (error as any).retryAfter || 60,
            },
            { status: 429 }
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
        { error: 'INTERNAL_ERROR', message: 'Failed to generate audio' },
        { status: 500 }
      )
    );
  }
}
