# Text-to-Speech with S3 Caching - Design Document

## Overview

This document describes the architecture for adding Text-to-Speech (TTS) functionality to tour players using ElevenLabs API with S3-based caching. The system is designed to be cost-effective, secure, and work across both web and Electron applications.

## Architecture

```
┌─────────────────┐
│  Web App /      │
│  Electron App   │
└────────┬────────┘
         │
         │ 1. Request audio for tour step
         │    POST /api/tts/generate
         │    { repo, path, stepId }
         │
         ▼
┌─────────────────────────┐
│  Backend API Server     │
│  - Validates request    │
│  - Fetches from GitHub  │
│  - Checks S3 cache      │
│  - Calls ElevenLabs     │
│  - Uploads to S3        │
└────────┬────────────────┘
         │
         ├─────────► GitHub API
         │           (fetch tour file)
         │
         ├─────────► S3 Bucket
         │           (check/store audio)
         │
         └─────────► ElevenLabs API
                     (generate audio)

┌─────────────────────────┐
│  S3 Bucket Structure    │
│                         │
│  /tts-audio/            │
│    /{repo-owner}/       │
│      /{repo-name}/      │
│        /{file-hash}/    │
│          /{step-id}.mp3 │
└─────────────────────────┘
```

## Security Model

### Key Principle: Zero Trust User Input

**IMPORTANT**: The API must NOT accept arbitrary text from clients. This prevents:
- Abuse of ElevenLabs API quota
- Injection of malicious or inappropriate content
- Unauthorized usage

### Validation Flow

1. Client sends: `{ repo, owner, path, stepId, commitSha }`
2. API fetches tour file from GitHub: `https://raw.githubusercontent.com/{owner}/{repo}/{commitSha}/{path}`
3. API parses tour JSON and validates `stepId` exists
4. API extracts `step.description` from trusted source
5. API generates audio ONLY for validated content

### Why This Matters

- **Web App**: Users could modify client-side code to send arbitrary text
- **Electron App**: Same risk if user has dev tools enabled or modified app
- **API Solution**: API is single source of truth, fetches content from GitHub itself

## API Specification

### Endpoint: `POST /api/tts/generate`

Generates or retrieves cached TTS audio for a tour step.

**Request Body:**
```json
{
  "owner": "anthropics",
  "repo": "web-ade",
  "path": "docs/tours/introduction.tour.json",
  "commitSha": "abc123def456",
  "stepId": "step-01",
  "voice": "default",
  "speed": 1.0
}
```

**Response:**
```json
{
  "audioUrl": "https://cdn.example.com/tts-audio/anthropics/web-ade/abc123/step-01.mp3",
  "cached": true,
  "duration": 12.5,
  "generatedAt": "2026-02-03T04:30:00Z"
}
```

**Error Responses:**
```json
{
  "error": "TOUR_NOT_FOUND",
  "message": "Tour file not found at specified path"
}

{
  "error": "STEP_NOT_FOUND",
  "message": "Step step-01 not found in tour"
}

{
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "ElevenLabs API rate limit exceeded",
  "retryAfter": 60
}
```

### Endpoint: `POST /api/tts/batch-generate`

Pre-fetch audio for all steps in a tour (called when tour loads).

**Request Body:**
```json
{
  "owner": "anthropics",
  "repo": "web-ade",
  "path": "docs/tours/introduction.tour.json",
  "commitSha": "abc123def456",
  "voice": "default",
  "speed": 1.0
}
```

**Response:**
```json
{
  "tourId": "introduction-tour",
  "steps": [
    {
      "stepId": "step-01",
      "audioUrl": "https://cdn.example.com/.../step-01.mp3",
      "cached": true
    },
    {
      "stepId": "step-02",
      "audioUrl": "https://cdn.example.com/.../step-02.mp3",
      "cached": false,
      "status": "generating"
    }
  ],
  "totalSteps": 12,
  "cachedSteps": 10,
  "generatingSteps": 2
}
```

## Backend Implementation

### S3 Key Generation

```
Pattern: /tts-audio/{owner}/{repo}/{file-hash}/{step-id}-{options-hash}.mp3

Example: /tts-audio/anthropics/web-ade/a3f9c2/step-01-default-1.0.mp3

Where:
- file-hash: SHA-256 of (path + commitSha) - ensures cache invalidation
- options-hash: voice + speed settings
```

### Caching Strategy

1. **Check S3**: HEAD request to check if audio exists
2. **If exists**: Return S3 URL immediately (cached: true)
3. **If not exists**:
   - Fetch tour file from GitHub
   - Validate step exists
   - Call ElevenLabs API
   - Upload to S3
   - Return S3 URL (cached: false)

### GitHub Fetching

```typescript
async function fetchTourFromGitHub(
  owner: string,
  repo: string,
  path: string,
  commitSha: string
): Promise<IntroductionTour> {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${commitSha}/${path}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`, // Optional, for private repos
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('TOUR_NOT_FOUND');
  }

  const tour = await response.json();

  // Validate tour structure
  if (!tour.id || !tour.steps || !Array.isArray(tour.steps)) {
    throw new Error('INVALID_TOUR_FORMAT');
  }

  return tour;
}
```

### ElevenLabs Integration

```typescript
async function generateAudio(text: string, options: TTSOptions): Promise<Buffer> {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${options.voice}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.5,
          speed: options.speed,
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`ELEVENLABS_ERROR: ${error.message}`);
  }

  return Buffer.from(await response.arrayBuffer());
}
```

### S3 Upload

```typescript
async function uploadToS3(key: string, audioBuffer: Buffer): Promise<string> {
  const s3 = new AWS.S3();

  await s3.putObject({
    Bucket: process.env.S3_BUCKET,
    Key: key,
    Body: audioBuffer,
    ContentType: 'audio/mpeg',
    CacheControl: 'public, max-age=31536000', // 1 year
    Metadata: {
      'generated-at': new Date().toISOString(),
    },
  }).promise();

  // Return CDN URL if available, otherwise S3 URL
  const cdnDomain = process.env.CDN_DOMAIN;
  if (cdnDomain) {
    return `https://${cdnDomain}/${key}`;
  }

  return `https://${process.env.S3_BUCKET}.s3.amazonaws.com/${key}`;
}
```

## Client-Side Implementation

### Panel's Role

**IMPORTANT**: The panel package (`@industry-theme/file-city-panel`) provides:
- ✅ `TextToSpeechAdapter` interface definition
- ✅ `MockTTSAdapter` for testing/Storybook
- ✅ `TourPlayer` component that accepts adapter via props
- ❌ **NO production adapter implementation** (host's responsibility)

The panel **cannot** make API calls because:
1. It doesn't have access to credentials
2. It runs in different contexts (web app, Electron, etc.)
3. Authentication is the host application's concern

### Adapter Interface (Provided by Panel)

```typescript
// This interface is exported by @industry-theme/file-city-panel
export interface TextToSpeechAdapter {
  /**
   * Fetch audio URLs for all steps in a tour
   * This is called when the tour loads to ensure audio is available
   */
  fetchTourAudio(tour: IntroductionTour, context: {
    owner: string;
    repo: string;
    path: string;
    commitSha: string;
  }): Promise<Map<string, string>>;

  /**
   * Play audio for a specific step
   */
  speak(stepId: string): Promise<void>;

  stop(): void;
  pause(): void;
  resume(): void;

  state: TTSState;
  addEventListener(event: TTSEvent, handler: () => void): void;
  removeEventListener(event: TTSEvent, handler: () => void): void;
}
```

### Host Application Adapter Implementation (Your Responsibility)

**IMPORTANT**: This code belongs in YOUR host application, NOT the panel package.

The following is a **reference implementation** showing how to implement the adapter
in your host app. You should create this file in your own codebase:

```typescript
// File: your-host-app/src/adapters/TTSAdapter.ts
// This is YOUR implementation - customize as needed for your architecture

export class S3BackedTTSAdapter implements TextToSpeechAdapter {
  private apiBaseUrl: string;
  private audioCache: Map<string, string> = new Map(); // stepId -> audioUrl
  private audio: HTMLAudioElement | null = null;

  public state: TTSState = {
    isLoading: false,
    isPlaying: false,
    isPaused: false,
    error: null,
  };

  constructor(apiBaseUrl: string) {
    this.apiBaseUrl = apiBaseUrl;
  }

  async fetchTourAudio(
    tour: IntroductionTour,
    context: { owner: string; repo: string; path: string; commitSha: string }
  ): Promise<Map<string, string>> {
    const response = await fetch(`${this.apiBaseUrl}/api/tts/batch-generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(context),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch tour audio');
    }

    const data = await response.json();

    // Cache all URLs
    for (const step of data.steps) {
      this.audioCache.set(step.stepId, step.audioUrl);
    }

    return this.audioCache;
  }

  async speak(stepId: string): Promise<void> {
    const audioUrl = this.audioCache.get(stepId);
    if (!audioUrl) {
      throw new Error(`No audio URL for step: ${stepId}`);
    }

    this.stop();
    this.audio = new Audio(audioUrl);

    // Set up event listeners...
    await this.audio.play();
  }

  // ... rest of implementation
}
```

### TourPlayer Integration

```typescript
export const TourPlayer: React.FC<TourPlayerProps> = ({
  tour,
  context,
  tourMetadata, // { owner, repo, path, commitSha }
  autoPlayAudio = false,
  autoAdvanceOnAudioEnd = false,
}) => {
  const tts = context.adapters.textToSpeech;
  const [audioReady, setAudioReady] = useState(false);

  // Fetch audio on mount
  useEffect(() => {
    if (!tts || !tourMetadata) return;

    async function loadAudio() {
      try {
        await tts.fetchTourAudio(tour, tourMetadata);
        setAudioReady(true);
      } catch (error) {
        console.error('[TourPlayer] Failed to load audio:', error);
      }
    }

    loadAudio();
  }, [tts, tour, tourMetadata]);

  // Only show TTS controls when audio is ready
  const showTTSControls = tts && audioReady;

  // ... rest of component
};
```

## Electron App Integration

**IMPORTANT**: The Electron app uses the **same API** as the web app. No special handling needed.

### Configuration

```typescript
// In Electron app initialization
const ttsAdapter = new S3BackedTTSAdapter('https://api.web-ade.com');

const panelContext: PanelContextValue = {
  // ... other context
  adapters: {
    readFile: electronFileReader,
    textToSpeech: ttsAdapter, // Same adapter as web!
  },
};
```

### Benefits

1. **Consistent behavior**: Web and Electron work identically
2. **Shared cache**: Both benefit from S3-cached audio
3. **No duplication**: One API implementation serves both
4. **Easy updates**: Update API without rebuilding Electron app

## Cost Optimization

### ElevenLabs Pricing (as of 2024)

- Creator Plan: ~$22/month for 100K characters
- Average step description: ~200 characters
- Cost per step: ~$0.044
- 10-step tour: ~$0.44 to generate

### Caching Impact

- Generate once, serve forever (until content changes)
- S3 storage: ~$0.023/GB/month
- Audio file size: ~100KB per minute of audio
- 10-step tour (20 mins total): ~2MB = $0.00005/month storage

**Result**: After initial generation, cost is negligible.

### Cache Invalidation

Cache is invalidated when:
1. Tour file content changes (different `commitSha`)
2. Voice settings change (different options hash)

## Monitoring & Observability

### Metrics to Track

- **Cache hit rate**: % of requests served from S3
- **Generation time**: Time to call ElevenLabs + upload
- **API errors**: ElevenLabs failures, GitHub fetch failures
- **Cost tracking**: ElevenLabs character usage

### Logging

```typescript
{
  "event": "tts_generation",
  "repo": "anthropics/web-ade",
  "path": "docs/tours/intro.tour.json",
  "stepId": "step-01",
  "cached": false,
  "duration_ms": 2450,
  "characters": 234,
  "cost_usd": 0.044
}
```

## Security Considerations

### Rate Limiting

- Limit requests per IP: 100/hour
- Limit requests per repo: 1000/day
- Prevents abuse of API and ElevenLabs quota

### Authentication (Optional)

For private repositories:
- Require GitHub token in request
- API validates token has read access to repo
- Ensures users can only generate audio for repos they have access to

### Content Validation

- Maximum step description length: 5000 characters
- Reject non-text content (HTML tags, scripts, etc.)
- Sanitize any user-provided metadata

## Future Enhancements

1. **Streaming**: Stream audio while generating (ElevenLabs supports this)
2. **Voice selection**: Let users choose from multiple voices
3. **Multilingual**: Support tours in multiple languages
4. **Audio waveforms**: Show waveform visualization during playback
5. **Playback speed**: Let users adjust speed without regenerating
6. **Subtitles/Captions**: Generate synchronized captions from description

## Implementation Checklist

### Backend
- [ ] Create API endpoints (`/api/tts/generate`, `/api/tts/batch-generate`)
- [ ] Implement GitHub fetching with error handling
- [ ] Integrate ElevenLabs API
- [ ] Set up S3 bucket with proper CORS
- [ ] Implement caching logic
- [ ] Add rate limiting
- [ ] Add monitoring/logging
- [ ] Deploy to production

### Frontend (File City Panel)
- [ ] Add `TextToSpeechAdapter` interface to types
- [ ] Create `S3BackedTTSAdapter` implementation
- [ ] Update `TourPlayer` with TTS controls
- [ ] Add audio progress bar
- [ ] Implement auto-play functionality
- [ ] Implement auto-advance on audio end
- [ ] Add loading states
- [ ] Test in Storybook with mock adapter
- [ ] Update documentation

### Electron App
- [ ] Configure TTS adapter with API URL
- [ ] Test audio playback in Electron environment
- [ ] Verify CORS handling
- [ ] Update user documentation

### Testing
- [ ] Unit tests for adapter
- [ ] Integration tests for API
- [ ] E2E tests for tour player with audio
- [ ] Performance tests (cache hit rates)
- [ ] Cost tracking verification

## Questions & Decisions

1. **CDN**: Should we use CloudFront or similar CDN for S3?
   - Recommendation: Yes, for global performance

2. **Fallback**: What if ElevenLabs is down?
   - Recommendation: Gracefully disable TTS, tour still works

3. **Voice selection**: Single voice or multiple?
   - Recommendation: Start with single default voice

4. **Private repos**: Support them?
   - Recommendation: Yes, with GitHub token authentication

5. **Audio format**: MP3 vs other formats?
   - Recommendation: MP3 for broad compatibility

## References

- [ElevenLabs API Docs](https://elevenlabs.io/docs/overview/capabilities/text-to-speech)
- [AWS S3 CORS Configuration](https://docs.aws.amazon.com/AmazonS3/latest/userguide/cors.html)
- [GitHub Raw Content API](https://docs.github.com/en/repositories/working-with-files/using-files/getting-permanent-links-to-files)
