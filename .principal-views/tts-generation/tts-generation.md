# Text-to-Speech Generation

## Overview

This OTEL canvas documents the telemetry events emitted during Text-to-Speech (TTS) audio generation for tour steps. The system uses the ElevenLabs API with S3-based caching to provide cost-effective, high-quality audio narration.

## Event Schema

### Lifecycle Events

#### `tts.request.started`
**Source:** `src/app/api/tts/generate/route.ts`

Emitted when a TTS generation request is received from the client.

**Attributes:**
- `tts.owner` (string, required): GitHub repository owner
- `tts.repo` (string, required): GitHub repository name
- `tts.path` (string, required): Path to tour file in repository
- `tts.stepId` (string, required): Tour step ID to generate audio for
- `tts.commitSha` (string, required): Git commit SHA for cache key generation
- `tts.voice` (string, optional): ElevenLabs voice ID
- `tts.speed` (number, optional): Playback speed (0.5-2.0)

#### `tts.request.complete`
**Source:** `src/app/api/tts/generate/route.ts`

Emitted when TTS request completes successfully (both cache hit and cache miss paths).

**Attributes:**
- `tts.audioUrl` (string, required): Final audio URL returned to client
- `tts.cached` (boolean, required): Whether audio was served from cache
- `tts.durationMs` (number, required): Total request duration in milliseconds

### Cache Events

#### `tts.cache.hit`
**Source:** `src/app/api/tts/generate/route.ts`

Emitted when cached audio is found in S3, enabling fast path response.

**Attributes:**
- `tts.s3Key` (string, required): S3 key for the cached audio file
- `tts.audioUrl` (string, required): Public URL to cached audio
- `tts.cached` (boolean, required): Always true for cache hits

#### `tts.cache.miss`
**Source:** `src/app/api/tts/generate/route.ts`

Emitted when audio is not found in S3 cache, requiring generation.

**Attributes:**
- `tts.s3Key` (string, required): S3 key that was checked
- `tts.cached` (boolean, required): Always false for cache misses

### Data Events

#### `tts.tour.fetched`
**Source:** `src/lib/tts/github-fetcher.ts`

Emitted when tour file is successfully fetched from GitHub.

**Attributes:**
- `tts.tourId` (string, required): Tour file identifier
- `tts.stepDescription` (string, required): Text content to convert to speech
- `tts.textLength` (number, required): Character count of step description

### Processing Events

#### `tts.audio.generated`
**Source:** `src/lib/tts/elevenlabs-client.ts`

Emitted when ElevenLabs successfully generates audio from text.

**Attributes:**
- `tts.generationTimeMs` (number, required): Time taken to generate audio in milliseconds
- `tts.textLength` (number, required): Character count of input text
- `tts.audioSizeBytes` (number, required): Size of generated audio buffer in bytes
- `tts.voice` (string, optional): Voice ID used for generation
- `tts.model` (string, optional): ElevenLabs model ID used

### Storage Events

#### `tts.audio.uploaded`
**Source:** `src/lib/tts/s3-cache.ts`

Emitted when generated audio is uploaded to S3 cache.

**Attributes:**
- `tts.s3Key` (string, required): S3 key where audio was stored
- `tts.audioUrl` (string, required): Public URL to uploaded audio
- `tts.audioSizeBytes` (number, required): Size of uploaded audio in bytes

### Error Events

#### `tts.error.tour_not_found`
**Source:** `src/lib/tts/github-fetcher.ts`

Emitted when tour file could not be fetched from GitHub (404).

**Attributes:**
- `tts.errorCode` (string, required): Error code (TOUR_NOT_FOUND)
- `tts.errorMessage` (string, required): Human-readable error message
- `tts.httpStatus` (number, required): HTTP status code (404)
- `tts.owner` (string, required): GitHub repository owner
- `tts.repo` (string, required): GitHub repository name
- `tts.path` (string, required): Path that was not found

#### `tts.error.step_not_found`
**Source:** `src/lib/tts/github-fetcher.ts`

Emitted when requested step ID does not exist in tour file.

**Attributes:**
- `tts.errorCode` (string, required): Error code (STEP_NOT_FOUND)
- `tts.errorMessage` (string, required): Human-readable error message
- `tts.stepId` (string, required): Step ID that was not found
- `tts.httpStatus` (number, required): HTTP status code (404)

#### `tts.error.rate_limit`
**Source:** `src/lib/tts/elevenlabs-client.ts`

Emitted when ElevenLabs API rate limit is exceeded (429).

**Attributes:**
- `tts.errorCode` (string, required): Error code (RATE_LIMIT_EXCEEDED)
- `tts.errorMessage` (string, required): Human-readable error message
- `tts.retryAfter` (number, required): Seconds to wait before retrying
- `tts.httpStatus` (number, required): HTTP status code (429)

## Execution Flows

### Flow 1: Cache Hit (Fast Path)
**Duration:** ~50-100ms
**Cost:** $0

1. `tts.request.started` - Request received
2. `tts.cache.hit` - Audio found in S3
3. `tts.request.complete` - URL returned (cached: true)

**Characteristics:**
- No ElevenLabs API call
- No generation cost
- Sub-second response time
- Ideal for repeated requests

### Flow 2: Cache Miss (Generation Path)
**Duration:** ~2-5 seconds
**Cost:** ~$0.044 per step (200 chars)

1. `tts.request.started` - Request received
2. `tts.cache.miss` - Audio not in cache
3. `tts.tour.fetched` - Tour file fetched from GitHub
4. `tts.audio.generated` - Audio generated by ElevenLabs
5. `tts.audio.uploaded` - Audio uploaded to S3
6. `tts.request.complete` - URL returned (cached: false)

**Characteristics:**
- Full generation pipeline
- ElevenLabs API usage
- Generation + upload time
- Subsequent requests will be cache hits

### Flow 3: Tour Not Found Error

1. `tts.request.started` - Request received
2. `tts.cache.miss` - Audio not in cache
3. `tts.error.tour_not_found` - GitHub returns 404

**Response:** HTTP 404 with error details

### Flow 4: Step Not Found Error

1. `tts.request.started` - Request received
2. `tts.cache.miss` - Audio not in cache
3. `tts.tour.fetched` - Tour file fetched successfully
4. `tts.error.step_not_found` - Step ID validation fails

**Response:** HTTP 404 with error details

### Flow 5: Rate Limit Error

1. `tts.request.started` - Request received
2. `tts.cache.miss` - Audio not in cache
3. `tts.tour.fetched` - Tour file fetched successfully
4. `tts.error.rate_limit` - ElevenLabs API returns 429

**Response:** HTTP 429 with retry-after header

## Implementation Notes

### Security Model
The API implements **zero-trust architecture** by:
- Never accepting arbitrary text from clients
- Fetching tour content directly from GitHub
- Validating step IDs before generation
- Using commit SHA in cache keys

### Cache Strategy
- **Key Pattern:** `/tts-audio/{owner}/{repo}/{file-hash}/{step-id}-{options-hash}.mp3`
- **TTL:** 1 year (HTTP Cache-Control header)
- **Invalidation:** Automatic on tour content or voice settings change
- **Storage Cost:** ~$0.00005/month per tour

### Cost Optimization
- **First generation:** ~$0.44 for 10-step tour
- **Cached requests:** $0.00 (served from S3)
- **Cache hit rate:** Expected >95% after initial tour load

### Rate Limiting
- ElevenLabs API has rate limits
- System handles 429 responses gracefully
- Returns retry-after header to clients
- Cached requests bypass rate limits

## Testing Strategy

### Test Scenarios
1. **Cache Hit Success** - Request with existing cache entry
2. **Cache Miss Success** - First-time request, full generation
3. **Tour Not Found** - Invalid repository path
4. **Step Not Found** - Invalid step ID in valid tour
5. **Rate Limit** - Simulate ElevenLabs 429 response

### Instrumentation Points
- All event emissions in route handler and supporting functions
- Use `@opentelemetry/api` for trace and event instrumentation
- Validate event attributes against canvas schema

## Related Documentation

- **Architecture Canvas:** `.principal-views/tts-s3-architecture.canvas` (visual architecture diagram)
- **Design Document:** `TTS_S3_DESIGN.md` (full technical specification)
- **Implementation:**
  - `src/app/api/tts/generate/route.ts` (API endpoint)
  - `src/lib/tts/elevenlabs-client.ts` (ElevenLabs integration)
  - `src/lib/tts/github-fetcher.ts` (Tour fetching)
  - `src/lib/tts/s3-cache.ts` (S3 caching)
