/**
 * TTS Generation OTEL Tests
 *
 * Tests TTS generation with OTEL telemetry capture for different scenarios:
 * - Cache hit (fast path)
 * - Cache miss with successful generation
 * - Error scenarios (tour not found, step not found, rate limit)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { clearSpans, exportSpansToOTLP } from './otel-setup';
import { POST } from '@/app/api/tts/generate/route';
import { NextRequest } from 'next/server';
import type { IntroductionTour, TTSOptions } from '@/lib/tts/types';

// Mock dependencies
import * as s3Cache from '@/lib/tts/s3-cache';
import * as githubFetcher from '@/lib/tts/github-fetcher';
import * as elevenlabsClient from '@/lib/tts/elevenlabs-client';
import { vi } from 'vitest';

vi.mock('@/lib/tts/s3-cache');
vi.mock('@/lib/tts/github-fetcher');
vi.mock('@/lib/tts/elevenlabs-client');

describe('TTS Generation with OTEL', () => {
  beforeEach(() => {
    clearSpans();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('cache hit - fast path', async () => {
    // Mock S3 cache hit
    vi.mocked(s3Cache.checkS3Cache).mockResolvedValue(true);
    vi.mocked(s3Cache.getS3Url).mockReturnValue(
      'https://s3.amazonaws.com/test-bucket/cached-audio.mp3'
    );

    // Create request
    const request = new NextRequest('http://localhost:3000/api/tts/generate', {
      method: 'POST',
      body: JSON.stringify({
        owner: 'test-owner',
        repo: 'test-repo',
        path: 'tours/test-tour.json',
        commitSha: 'abc123',
        stepId: 'step-1',
      }),
    });

    // Call endpoint
    const response = await POST(request);
    const data = await response.json();

    // Verify response
    expect(response.status).toBe(200);
    expect(data.cached).toBe(true);
    expect(data.audioUrl).toContain('s3.amazonaws.com');

    // Export telemetry to cache-hit workflow
    exportSpansToOTLP('cache-hit-test', 'tts-generation/cache-hit');
  });

  it('cache miss - full generation', async () => {
    // Mock S3 cache miss
    vi.mocked(s3Cache.checkS3Cache).mockResolvedValue(false);

    // Mock GitHub tour fetch
    vi.mocked(githubFetcher.fetchTourFromGitHub).mockResolvedValue({
      id: 'test-tour-123',
      title: 'Test Tour',
      description: 'Test tour description',
      steps: [
        {
          id: 'step-1',
          title: 'Step 1',
          description: 'This is a test step description for audio generation.',
        },
      ],
    } satisfies IntroductionTour);

    vi.mocked(githubFetcher.getStepDescription).mockReturnValue(
      'This is a test step description for audio generation.'
    );

    // Mock ElevenLabs audio generation
    const mockAudioBuffer = Buffer.from('mock-audio-data');
    vi.mocked(elevenlabsClient.generateAudio).mockResolvedValue(mockAudioBuffer);

    // Mock TTS options
    vi.mocked(elevenlabsClient.mergeTTSOptions).mockReturnValue({
      voice: '21m00Tcm4TlvDq8ikWAM',
      speed: 1.0,
      model: 'eleven_v3',
    });

    // Mock S3 upload
    vi.mocked(s3Cache.uploadToS3).mockResolvedValue(
      'https://s3.amazonaws.com/test-bucket/generated-audio.mp3'
    );

    // Create request
    const request = new NextRequest('http://localhost:3000/api/tts/generate', {
      method: 'POST',
      body: JSON.stringify({
        owner: 'test-owner',
        repo: 'test-repo',
        path: 'tours/test-tour.json',
        commitSha: 'abc123',
        stepId: 'step-1',
      }),
    });

    // Call endpoint
    const response = await POST(request);
    const data = await response.json();

    // Verify response
    expect(response.status).toBe(200);
    expect(data.cached).toBe(false);
    expect(data.audioUrl).toContain('s3.amazonaws.com');

    // Verify mocks were called
    expect(s3Cache.checkS3Cache).toHaveBeenCalled();
    expect(githubFetcher.fetchTourFromGitHub).toHaveBeenCalled();
    expect(elevenlabsClient.generateAudio).toHaveBeenCalled();
    expect(s3Cache.uploadToS3).toHaveBeenCalled();

    // Export telemetry to cache-miss workflow
    exportSpansToOTLP('cache-miss-test', 'tts-generation/cache-miss');
  });

  it('tour not found error', async () => {
    // Mock S3 cache miss
    vi.mocked(s3Cache.checkS3Cache).mockResolvedValue(false);

    // Mock GitHub 404 error
    const error = Object.assign(new Error('TOUR_NOT_FOUND'), {
      owner: 'test-owner',
      repo: 'test-repo',
      path: 'tours/missing-tour.json',
    });
    vi.mocked(githubFetcher.fetchTourFromGitHub).mockRejectedValue(error);

    // Create request
    const request = new NextRequest('http://localhost:3000/api/tts/generate', {
      method: 'POST',
      body: JSON.stringify({
        owner: 'test-owner',
        repo: 'test-repo',
        path: 'tours/missing-tour.json',
        commitSha: 'abc123',
        stepId: 'step-1',
      }),
    });

    // Call endpoint
    const response = await POST(request);
    const data = await response.json();

    // Verify error response
    expect(response.status).toBe(404);
    expect(data.error).toBe('TOUR_NOT_FOUND');

    // Export telemetry to tour-not-found workflow
    exportSpansToOTLP('tour-not-found-test', 'tts-generation/tour-not-found');
  });

  it('step not found error', async () => {
    // Mock S3 cache miss
    vi.mocked(s3Cache.checkS3Cache).mockResolvedValue(false);

    // Mock GitHub tour fetch
    vi.mocked(githubFetcher.fetchTourFromGitHub).mockResolvedValue({
      id: 'test-tour-123',
      title: 'Test Tour',
      description: 'Test tour description',
      steps: [
        {
          id: 'step-1',
          title: 'Step 1',
          description: 'This is step 1',
        },
      ],
    } satisfies IntroductionTour);

    // Mock step validation error
    const error = Object.assign(new Error('STEP_NOT_FOUND'), {
      stepId: 'invalid-step',
    });
    vi.mocked(githubFetcher.getStepDescription).mockImplementation(() => {
      throw error;
    });

    // Create request
    const request = new NextRequest('http://localhost:3000/api/tts/generate', {
      method: 'POST',
      body: JSON.stringify({
        owner: 'test-owner',
        repo: 'test-repo',
        path: 'tours/test-tour.json',
        commitSha: 'abc123',
        stepId: 'invalid-step',
      }),
    });

    // Call endpoint
    const response = await POST(request);
    const data = await response.json();

    // Verify error response
    expect(response.status).toBe(404);
    expect(data.error).toBe('STEP_NOT_FOUND');

    // Export telemetry to step-not-found workflow
    exportSpansToOTLP('step-not-found-test', 'tts-generation/step-not-found');
  });

  it('rate limit error', async () => {
    // Mock S3 cache miss
    vi.mocked(s3Cache.checkS3Cache).mockResolvedValue(false);

    // Mock GitHub tour fetch
    vi.mocked(githubFetcher.fetchTourFromGitHub).mockResolvedValue({
      id: 'test-tour-123',
      title: 'Test Tour',
      description: 'Test tour description',
      steps: [
        {
          id: 'step-1',
          title: 'Step 1',
          description: 'This is a test step',
        },
      ],
    } satisfies IntroductionTour);

    vi.mocked(githubFetcher.getStepDescription).mockReturnValue('This is a test step');

    // Mock TTS options
    vi.mocked(elevenlabsClient.mergeTTSOptions).mockReturnValue({
      voice: '21m00Tcm4TlvDq8ikWAM',
      speed: 1.0,
      model: 'eleven_v3',
    } satisfies TTSOptions);

    // Mock ElevenLabs rate limit error
    const error = Object.assign(new Error('RATE_LIMIT_EXCEEDED'), {
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: 60,
    });
    vi.mocked(elevenlabsClient.generateAudio).mockRejectedValue(error);

    // Create request
    const request = new NextRequest('http://localhost:3000/api/tts/generate', {
      method: 'POST',
      body: JSON.stringify({
        owner: 'test-owner',
        repo: 'test-repo',
        path: 'tours/test-tour.json',
        commitSha: 'abc123',
        stepId: 'step-1',
      }),
    });

    // Call endpoint
    const response = await POST(request);
    const data = await response.json();

    // Verify error response
    expect(response.status).toBe(429);
    expect(data.error).toBe('RATE_LIMIT_EXCEEDED');
    expect(data.retryAfter).toBe(60);

    // Export telemetry to rate-limit workflow
    exportSpansToOTLP('rate-limit-test', 'tts-generation/rate-limit');
  });
});
