/**
 * ElevenLabs API Client
 *
 * Integrates with ElevenLabs Text-to-Speech API for audio generation.
 */

import { TTSOptions, TTSErrorCode, TTSError } from './types';

const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';

/**
 * Generates audio using ElevenLabs Text-to-Speech API
 *
 * @param text - Text to convert to speech
 * @param options - TTS options (voice, speed, model)
 * @param previousText - Optional previous text for contextual continuity
 * @returns MP3 audio as Buffer
 * @throws Error with TTSErrorCode on failure
 */
export async function generateAudio(
  text: string,
  options: TTSOptions,
  previousText?: string
): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    console.error('[ElevenLabs] API key not configured');
    throw new Error('ELEVENLABS_API_KEY not configured');
  }

  const url = `${ELEVENLABS_API_BASE}/text-to-speech/${options.voice}`;

  try {
    // Build request body with optional previous_text for contextual continuity
    const requestBody: Record<string, unknown> = {
      text,
      model_id: options.model,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
      },
    };

    // Add previous_text for better continuity between sequential generations
    if (previousText && previousText.trim()) {
      requestBody.previous_text = previousText.trim();
    }

    // Add pronunciation dictionary for code terms if configured
    const dictionaryId = process.env.ELEVENLABS_PRONUNCIATION_DICTIONARY_ID;
    if (dictionaryId) {
      requestBody.pronunciation_dictionary_locators = [
        {
          pronunciation_dictionary_id: dictionaryId,
          // version_id omitted = use latest version
        },
      ];
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify(requestBody),
    });

    // Handle rate limiting
    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      const error = new Error(TTSErrorCode.RATE_LIMIT_EXCEEDED) as TTSError;
      error.code = TTSErrorCode.RATE_LIMIT_EXCEEDED;
      error.retryAfter = retryAfter ? parseInt(retryAfter) : 60;
      console.error('[ElevenLabs] Rate limit exceeded', {
        retryAfter: error.retryAfter,
      });
      throw error;
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error('[ElevenLabs] API error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });
      throw new Error(TTSErrorCode.ELEVENLABS_ERROR);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    // Re-throw TTS error codes
    if (
      error instanceof Error &&
      error.message === TTSErrorCode.RATE_LIMIT_EXCEEDED
    ) {
      throw error;
    }

    console.error('[ElevenLabs] Generation failed:', error);
    throw new Error(TTSErrorCode.ELEVENLABS_ERROR);
  }
}

/**
 * Gets default TTS options from environment variables
 *
 * @returns Default TTS options
 */
export function getDefaultOptions(): TTSOptions {
  return {
    voice: process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM', // Rachel
    speed: 1.0,
    model: process.env.ELEVENLABS_MODEL_ID || 'eleven_v3', // v3 for highest quality and emotional range
  };
}

/**
 * Validates and merges user-provided TTS options with defaults
 *
 * Ensures speed is within valid range (0.5 - 2.0).
 *
 * @param userOptions - Optional user-provided options
 * @returns Merged and validated TTS options
 */
export function mergeTTSOptions(userOptions?: Partial<TTSOptions>): TTSOptions {
  const defaults = getDefaultOptions();

  return {
    voice: userOptions?.voice || defaults.voice,
    speed: Math.max(0.5, Math.min(2.0, userOptions?.speed || defaults.speed)),
    model: userOptions?.model || defaults.model,
  };
}
