/**
 * TTS (Text-to-Speech) Router
 *
 * Handles tour audio generation with S3 caching and ElevenLabs integration.
 * Migrated from /api/tts/* routes to tRPC for type safety.
 */

import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';

// Import existing TTS utilities
import { validateTTSRequest, generateS3Key } from '@/lib/tts/key-generator';
import { fetchTourFromGitHub, getStepDescription, normalizeTextForTTS } from '@/lib/tts/github-fetcher';
import { checkS3Cache, uploadToS3, getS3Url } from '@/lib/tts/s3-cache';
import { generateAudio, mergeTTSOptions } from '@/lib/tts/elevenlabs-client';
import { TTSErrorCode } from '@/lib/tts/types';

// ============================================================================
// Input Schemas (Zod)
// ============================================================================

const generateInputSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  path: z.string().min(1),
  commitSha: z.string().min(1),
  stepId: z.string().min(1),
  voice: z.string().optional(),
  speed: z.number().min(0.5).max(2).optional(),
});

const batchGenerateInputSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  path: z.string().min(1),
  commitSha: z.string().min(1),
  voice: z.string().optional(),
  speed: z.number().min(0.5).max(2).optional(),
});

// ============================================================================
// Output Types (inferred from Zod or explicit)
// ============================================================================

const generateOutputSchema = z.object({
  audioUrl: z.string(),
  cached: z.boolean(),
  duration: z.number().optional(),
  generatedAt: z.string(),
});

const batchStepSchema = z.object({
  stepId: z.string(),
  audioUrl: z.string(),
  cached: z.boolean(),
  status: z.enum(['ready', 'generating', 'failed']),
  error: z.string().optional(),
});

const batchOutputSchema = z.object({
  tourId: z.string(),
  steps: z.array(batchStepSchema),
  totalSteps: z.number(),
  cachedSteps: z.number(),
  generatingSteps: z.number(),
});

// ============================================================================
// Router Definition
// ============================================================================

export const ttsRouter = router({
  /**
   * Generate audio for a single tour step
   */
  generate: publicProcedure
    .input(generateInputSchema)
    .output(generateOutputSchema)
    .mutation(async ({ input }) => {
      const { owner, repo, path, commitSha, stepId, voice, speed } = input;

      // Validate request
      const validationError = validateTTSRequest({ owner, repo, path, commitSha, stepId });
      if (validationError) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: validationError,
        });
      }

      // Merge options with defaults
      const options = mergeTTSOptions({ voice, speed });

      // Generate S3 key for caching
      const s3Key = await generateS3Key(owner, repo, path, commitSha, stepId, options);

      // Check cache first
      const isCached = await checkS3Cache(s3Key);
      if (isCached) {
        console.log('[tRPC TTS] Cache hit:', s3Key);
        return {
          audioUrl: getS3Url(s3Key),
          cached: true,
          generatedAt: new Date().toISOString(),
        };
      }

      console.log('[tRPC TTS] Cache miss, generating audio:', { owner, repo, stepId });

      try {
        // Fetch tour from GitHub
        const tour = await fetchTourFromGitHub(owner, repo, path, commitSha);

        // Get step description
        const stepDescription = getStepDescription(tour, stepId);

        // Generate audio
        const audioBuffer = await generateAudio(stepDescription, options);

        // Upload to S3
        await uploadToS3(s3Key, audioBuffer);

        console.log('[tRPC TTS] Audio generated and cached:', s3Key);

        return {
          audioUrl: getS3Url(s3Key),
          cached: false,
          generatedAt: new Date().toISOString(),
        };
      } catch (error) {
        console.error('[tRPC TTS] Generation error:', error);

        // Map TTS errors to tRPC errors
        if (error instanceof Error) {
          const errorCode = error.message as TTSErrorCode;

          if (errorCode === TTSErrorCode.TOUR_NOT_FOUND) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Tour file not found',
            });
          }

          if (errorCode === TTSErrorCode.STEP_NOT_FOUND) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: `Step '${stepId}' not found in tour`,
            });
          }

          if (errorCode === TTSErrorCode.RATE_LIMIT_EXCEEDED) {
            throw new TRPCError({
              code: 'TOO_MANY_REQUESTS',
              message: 'Rate limit exceeded, please try again later',
            });
          }

          if (errorCode === TTSErrorCode.INVALID_TOUR_FORMAT) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Invalid tour file format',
            });
          }
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate audio',
          cause: error,
        });
      }
    }),

  /**
   * Batch generate audio for all steps in a tour
   */
  batchGenerate: publicProcedure
    .input(batchGenerateInputSchema)
    .output(batchOutputSchema)
    .mutation(async ({ input }) => {
      const { owner, repo, path, commitSha, voice, speed } = input;

      // Validate request
      const validationError = validateTTSRequest({ owner, repo, path, commitSha, stepId: 'batch' });
      if (validationError) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: validationError,
        });
      }

      // Merge options with defaults
      const options = mergeTTSOptions({ voice, speed });

      console.log('[tRPC TTS Batch] Processing tour:', { owner, repo, path });

      try {
        // Fetch tour from GitHub
        const tour = await fetchTourFromGitHub(owner, repo, path, commitSha);

        const steps: z.infer<typeof batchStepSchema>[] = [];
        let cachedCount = 0;
        let generatingCount = 0;

        // Process each step
        for (const step of tour.steps) {
          const stepId = step.id;
          const s3Key = await generateS3Key(owner, repo, path, commitSha, stepId, options);

          // Check cache
          const isCached = await checkS3Cache(s3Key);
          if (isCached) {
            steps.push({
              stepId,
              audioUrl: getS3Url(s3Key),
              cached: true,
              status: 'ready',
            });
            cachedCount++;
            continue;
          }

          // Get text content for this step
          const text = step.narration || step.description || step.content;
          if (!text) {
            console.warn('[tRPC TTS Batch] Skipping step with no text:', stepId);
            steps.push({
              stepId,
              audioUrl: '',
              cached: false,
              status: 'failed',
              error: 'No text content for step',
            });
            continue;
          }

          try {
            // Normalize and generate
            const normalizedText = normalizeTextForTTS(text);
            const audioBuffer = await generateAudio(normalizedText, options);
            await uploadToS3(s3Key, audioBuffer);

            steps.push({
              stepId,
              audioUrl: getS3Url(s3Key),
              cached: false,
              status: 'ready',
            });
            generatingCount++;

            console.log('[tRPC TTS Batch] Generated:', stepId);
          } catch (stepError) {
            console.error('[tRPC TTS Batch] Failed to generate step:', stepId, stepError);
            steps.push({
              stepId,
              audioUrl: '',
              cached: false,
              status: 'failed',
              error: stepError instanceof Error ? stepError.message : 'Unknown error',
            });
          }
        }

        console.log('[tRPC TTS Batch] Complete:', {
          total: steps.length,
          cached: cachedCount,
          generated: generatingCount,
        });

        return {
          tourId: tour.id,
          steps,
          totalSteps: steps.length,
          cachedSteps: cachedCount,
          generatingSteps: generatingCount,
        };
      } catch (error) {
        console.error('[tRPC TTS Batch] Error:', error);

        if (error instanceof Error) {
          const errorCode = error.message as TTSErrorCode;

          if (errorCode === TTSErrorCode.TOUR_NOT_FOUND) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Tour file not found',
            });
          }

          if (errorCode === TTSErrorCode.INVALID_TOUR_FORMAT) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Invalid tour file format',
            });
          }
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to batch generate audio',
          cause: error,
        });
      }
    }),
});

// Export type for client
export type TTSRouter = typeof ttsRouter;
