/**
 * POST /api/tts/generate
 *
 * Generates or retrieves cached TTS audio for a single tour step.
 *
 * Security: Implements zero-trust architecture by fetching tour content
 * from GitHub. Never accepts arbitrary text from clients.
 */

import { NextRequest, NextResponse } from 'next/server';
import { trace } from '@opentelemetry/api';
import {
  TTSGenerateRequest,
  TTSGenerateResponse,
  TTSErrorCode,
  TTSError,
} from '@/lib/tts/types';
import { validateTTSRequest, generateS3Key, generateLegacyS3Key } from '@/lib/tts/key-generator';
import {
  fetchTourFromGitHub,
  getStepDescription,
} from '@/lib/tts/github-fetcher';
import { checkS3Cache, uploadToS3, getS3Url } from '@/lib/tts/s3-cache';
import { generateAudio, mergeTTSOptions } from '@/lib/tts/elevenlabs-client';

// Get tracer for TTS operations
const tracer = trace.getTracer('tts-generation', '1.0.0');

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
  const startTime = Date.now();

  return tracer.startActiveSpan('tts.generation', async (span) => {
    try {
      const body = (await request.json()) as TTSGenerateRequest;

      // Emit request started event
      span.addEvent('tts.request.started', {
        'tts.owner': body.owner,
        'tts.repo': body.repo,
        'tts.path': body.path,
        'tts.stepId': body.stepId,
        'tts.commitSha': body.commitSha,
        ...(body.voice && { 'tts.voice': body.voice }),
        ...(body.speed && { 'tts.speed': body.speed }),
      });

      // Validate request parameters
      const validationError = validateTTSRequest(body);
      if (validationError) {
        span.end();
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

    // Generate legacy S3 key first (doesn't need content - fast path check)
    const legacyKey = await generateLegacyS3Key(
      body.owner,
      body.repo,
      body.path,
      body.commitSha,
      body.stepId,
      options
    );

    // Check legacy cache first (fast path - no GitHub fetch needed)
    const legacyCached = await checkS3Cache(legacyKey);

    if (legacyCached) {
      // Legacy cache hit - return immediately
      const audioUrl = getS3Url(legacyKey);

      // Emit cache hit event
      span.addEvent('tts.cache.hit', {
        'tts.s3Key': legacyKey,
        'tts.audioUrl': audioUrl,
        'tts.cached': true,
        'tts.isLegacy': true,
      });

      const durationMs = Date.now() - startTime;

      // Emit request complete event
      span.addEvent('tts.request.complete', {
        'tts.audioUrl': audioUrl,
        'tts.cached': true,
        'tts.durationMs': durationMs,
      });

      span.end();

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

    // Legacy cache miss - need to fetch tour to check content-based cache
    console.log('[TTS Generate] Legacy cache miss, fetching tour:', {
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

    // Emit tour fetched event
    span.addEvent('tts.tour.fetched', {
      'tts.tourId': tour.id,
      'tts.stepDescription': stepDescription,
      'tts.textLength': stepDescription.length,
    });

    // Generate content-based S3 key
    const contentKey = await generateS3Key(
      body.owner,
      body.repo,
      stepDescription,
      options
    );

    // Check content-based cache
    const contentCached = await checkS3Cache(contentKey);

    if (contentCached) {
      // Content cache hit - return immediately
      const audioUrl = getS3Url(contentKey);

      // Emit cache hit event
      span.addEvent('tts.cache.hit', {
        'tts.s3Key': contentKey,
        'tts.audioUrl': audioUrl,
        'tts.cached': true,
        'tts.isLegacy': false,
      });

      const durationMs = Date.now() - startTime;

      // Emit request complete event
      span.addEvent('tts.request.complete', {
        'tts.audioUrl': audioUrl,
        'tts.cached': true,
        'tts.durationMs': durationMs,
      });

      span.end();

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

    // Neither cache hit - need to generate audio
    console.log('[TTS Generate] Cache miss, generating audio:', {
      owner: body.owner,
      repo: body.repo,
      path: body.path,
      stepId: body.stepId,
    });

    // Emit cache miss event
    span.addEvent('tts.cache.miss', {
      'tts.s3Key': contentKey,
      'tts.cached': false,
    });

    // Generate audio using ElevenLabs
    const genStartTime = Date.now();
    const audioBuffer = await generateAudio(stepDescription, options);
    const generationTime = Date.now() - genStartTime;

    console.log('[TTS Generate] Audio generated:', {
      tourId: tour.id,
      stepId: body.stepId,
      textLength: stepDescription.length,
      generationTimeMs: generationTime,
    });

    // Emit audio generated event
    span.addEvent('tts.audio.generated', {
      'tts.generationTimeMs': generationTime,
      'tts.textLength': stepDescription.length,
      'tts.audioSizeBytes': audioBuffer.length,
      'tts.voice': options.voice,
      'tts.model': options.model,
    });

    // Upload to S3 for caching (always use content-based key for new uploads)
    const audioUrl = await uploadToS3(contentKey, audioBuffer, {
      'tour-id': tour.id,
      'step-id': body.stepId,
      'generation-time-ms': generationTime.toString(),
      'text-length': stepDescription.length.toString(),
    });

    // Emit audio uploaded event
    span.addEvent('tts.audio.uploaded', {
      'tts.s3Key': contentKey,
      'tts.audioUrl': audioUrl,
      'tts.audioSizeBytes': audioBuffer.length,
    });

    const durationMs = Date.now() - startTime;

    // Emit request complete event
    span.addEvent('tts.request.complete', {
      'tts.audioUrl': audioUrl,
      'tts.cached': false,
      'tts.durationMs': durationMs,
    });

    span.end();

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
    span.end();
    console.error('[TTS Generate] Error:', error);

    // Handle specific TTS errors
    if (error instanceof Error) {
      const errorCode = error.message as TTSErrorCode;

      if (errorCode === TTSErrorCode.TOUR_NOT_FOUND) {
        // Emit tour not found error event
        span.addEvent('tts.error.tour_not_found', {
          'tts.errorCode': errorCode,
          'tts.errorMessage': 'Tour file not found at specified path',
          'tts.httpStatus': 404,
          'tts.owner': (error as { owner?: string }).owner || '',
          'tts.repo': (error as { repo?: string }).repo || '',
          'tts.path': (error as { path?: string }).path || '',
        });

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
        const ttsError = error as TTSError;

        // Emit step not found error event
        span.addEvent('tts.error.step_not_found', {
          'tts.errorCode': errorCode,
          'tts.errorMessage': `Step ${ttsError.stepId || 'unknown'} not found in tour`,
          'tts.stepId': ttsError.stepId || 'unknown',
          'tts.httpStatus': 404,
        });

        return addCorsHeaders(
          NextResponse.json(
            {
              error: errorCode,
              message: `Step ${ttsError.stepId || 'unknown'} not found in tour`,
            },
            { status: 404 }
          )
        );
      }

      if (errorCode === TTSErrorCode.RATE_LIMIT_EXCEEDED) {
        const ttsError = error as TTSError;

        // Emit rate limit error event
        span.addEvent('tts.error.rate_limit', {
          'tts.errorCode': errorCode,
          'tts.errorMessage': 'ElevenLabs API rate limit exceeded',
          'tts.retryAfter': ttsError.retryAfter || 60,
          'tts.httpStatus': 429,
        });

        return addCorsHeaders(
          NextResponse.json(
            {
              error: errorCode,
              message: 'ElevenLabs API rate limit exceeded',
              retryAfter: ttsError.retryAfter || 60,
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
  });
}
