# Text-to-Speech with S3 Caching Architecture

## Overview

This canvas visualizes the architecture for adding Text-to-Speech (TTS) functionality to tour players using the ElevenLabs API with S3-based caching. The system is designed to be cost-effective, secure, and work across both web and Electron applications.

## Key Components

### Client Layer
- **Client Request**: Tour player initiates audio request with repo metadata
- **Audio Playback**: Client plays audio using S3BackedTTSAdapter and HTMLAudioElement

### API Layer
- **API Endpoint** (`POST /api/tts/generate`): Entry point that validates request parameters
- **GitHub Fetch**: Retrieves tour file content directly from GitHub's raw content API
- **Tour Validation**: Parses tour JSON and validates that the requested stepId exists

### Storage & Caching
- **S3 Cache Check**: Decision point checking if audio already exists
- **Cache Hit**: Fast path returning pre-generated audio (cached: true)
- **S3 Upload**: Stores newly generated audio with 1-year cache control
- **S3 Bucket Structure**: Organized by owner/repo/file-hash/step-id

### External Services
- **ElevenLabs API**: Generates high-quality TTS audio from step descriptions
- **Batch Generate Endpoint** (`POST /api/tts/batch-generate`): Pre-fetches all tour steps

### Error Handling
- **Tour Not Found**: GitHub fetch returns 404
- **Step Not Found**: Invalid stepId in tour file
- **ElevenLabs Failed**: API rate limit or generation error

## Flow Paths

### Happy Path (Cache Hit)
1. Client Request → API Endpoint
2. API Endpoint → GitHub Fetch
3. GitHub Fetch → Tour Validation
4. Tour Validation → S3 Cache Check
5. S3 Cache Check → Cache Hit (exists)
6. Cache Hit → Return Response
7. Return Response → Client Playback

**Result**: Fast response (<100ms), no ElevenLabs cost

### Cache Miss Path
1. Client Request → API Endpoint
2. API Endpoint → GitHub Fetch
3. GitHub Fetch → Tour Validation
4. Tour Validation → S3 Cache Check
5. S3 Cache Check → Generate Audio (not exists)
6. Generate Audio → S3 Upload
7. S3 Upload → Return Response
8. Return Response → Client Playback

**Result**: Slower response (2-5s), ~$0.044 cost per step

### Error Paths
- GitHub fetch fails → Tour Not Found (404)
- Step validation fails → Step Not Found (404)
- ElevenLabs API fails → Rate Limit Exceeded (429) or Server Error (500)

## Security Model

**Zero Trust User Input**: The API does NOT accept arbitrary text from clients. Instead:

1. Client sends: `{ repo, owner, path, stepId, commitSha }`
2. API fetches tour file from GitHub directly
3. API validates stepId exists and extracts step.description
4. API generates audio ONLY for validated content

This prevents:
- Abuse of ElevenLabs API quota
- Injection of malicious or inappropriate content
- Unauthorized usage

## Cost Optimization

### Initial Generation
- Average step: ~200 characters = ~$0.044
- 10-step tour: ~$0.44 to generate initially

### After Caching
- S3 storage: ~$0.00005/month per tour
- Cost per request: $0 (served from cache)
- Cache invalidation only when tour content or voice settings change

## Implementation Notes

### S3 Key Pattern
```
/tts-audio/{owner}/{repo}/{file-hash}/{step-id}-{options-hash}.mp3
```

Where:
- `file-hash`: SHA-256 of (path + commitSha) for cache invalidation
- `options-hash`: Voice + speed settings

### Cache Control
- HTTP Header: `Cache-Control: public, max-age=31536000` (1 year)
- Content-Type: `audio/mpeg`
- Metadata includes generation timestamp

### Rate Limiting
- Per IP: 100 requests/hour
- Per repo: 1000 requests/day
- Prevents abuse and protects ElevenLabs quota

## Future Enhancements

1. **Streaming**: Stream audio while generating (ElevenLabs supports this)
2. **Voice selection**: Multiple voice options for users
3. **Multilingual**: Support tours in multiple languages
4. **Audio waveforms**: Visualization during playback
5. **Playback speed control**: Client-side speed adjustment
6. **Subtitles/Captions**: Generate synchronized captions

## Related Documentation

- See `TTS_S3_DESIGN.md` for full technical specification
- See implementation checklist in design doc for development roadmap
