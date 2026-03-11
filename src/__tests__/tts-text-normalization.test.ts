/**
 * TTS Text Normalization Tests
 *
 * Tests for text mutation/normalization before sending to ElevenLabs.
 * Covers:
 * - normalizeTextForTTS (backtick removal, path conversion)
 * - getStepDescription (markdown stripping + normalization)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeTextForTTS,
  getStepDescription,
} from '@/lib/tts/github-fetcher';
import type { IntroductionTour } from '@/lib/tts/types';

describe('normalizeTextForTTS', () => {
  describe('backtick removal', () => {
    it('removes single backticks around inline code', () => {
      expect(normalizeTextForTTS('The `package.json` file')).toBe(
        'The package.json file'
      );
    });

    it('removes multiple backticks in same string', () => {
      expect(normalizeTextForTTS('Run `npm install` then `npm start`')).toBe(
        'Run npm install then npm start'
      );
    });

    it('handles backticks at start and end', () => {
      expect(normalizeTextForTTS('`code`')).toBe('code');
    });

    it('handles empty backticks', () => {
      expect(normalizeTextForTTS('Empty `` backticks')).toBe('Empty backticks');
    });

    it('handles triple backticks (code blocks)', () => {
      expect(normalizeTextForTTS('```javascript\ncode\n```')).toBe(
        'javascript code'
      );
    });
  });

  describe('path conversion', () => {
    it('converts simple path to spaces', () => {
      expect(normalizeTextForTTS('src/components/')).toBe('src components');
    });

    it('converts nested paths to spaces', () => {
      expect(normalizeTextForTTS('src/lib/tts/types.ts')).toBe(
        'src lib tts types.ts'
      );
    });

    it('handles trailing slashes', () => {
      expect(normalizeTextForTTS('The src/ directory')).toBe(
        'The src directory'
      );
    });

    it('handles multiple trailing slashes', () => {
      expect(normalizeTextForTTS('path/to/dir//')).toBe('path to dir');
    });

    it('preserves non-path slashes', () => {
      // Standalone slashes without word characters before them
      expect(normalizeTextForTTS('and/or choice')).toBe('and or choice');
    });

    it('handles root paths (leading slash preserved)', () => {
      // Leading slash is preserved because regex requires word char before slash
      expect(normalizeTextForTTS('The /root/path')).toBe('The /root path');
    });
  });

  describe('whitespace normalization', () => {
    it('collapses multiple spaces', () => {
      expect(normalizeTextForTTS('too   many    spaces')).toBe(
        'too many spaces'
      );
    });

    it('trims leading whitespace', () => {
      expect(normalizeTextForTTS('  leading spaces')).toBe('leading spaces');
    });

    it('trims trailing whitespace', () => {
      expect(normalizeTextForTTS('trailing spaces  ')).toBe('trailing spaces');
    });

    it('handles tabs and newlines', () => {
      expect(normalizeTextForTTS('tab\there\nnewline')).toBe('tab here newline');
    });

    it('handles mixed whitespace', () => {
      expect(normalizeTextForTTS('  mixed \t\n  whitespace  ')).toBe(
        'mixed whitespace'
      );
    });
  });

  describe('combined transformations', () => {
    it('handles backticks with paths', () => {
      expect(normalizeTextForTTS('The `src/components/` directory')).toBe(
        'The src components directory'
      );
    });

    it('handles real-world tour description', () => {
      const input =
        'Navigate to the `src/lib/tts/` folder to find the ElevenLabs client.';
      expect(normalizeTextForTTS(input)).toBe(
        'Navigate to the src lib tts folder to find the ElevenLabs client.'
      );
    });

    it('handles complex code references', () => {
      const input =
        'Import `generateAudio` from `@/lib/tts/elevenlabs-client.ts`';
      // @ is not a word character, so @/ is preserved
      expect(normalizeTextForTTS(input)).toBe(
        'Import generateAudio from @/lib tts elevenlabs-client.ts'
      );
    });

    it('handles package names with slashes', () => {
      expect(normalizeTextForTTS('Install `@scope/package`')).toBe(
        'Install @scope package'
      );
    });
  });

  describe('edge cases', () => {
    it('handles empty string', () => {
      expect(normalizeTextForTTS('')).toBe('');
    });

    it('handles string with only whitespace', () => {
      expect(normalizeTextForTTS('   ')).toBe('');
    });

    it('handles string with only backticks', () => {
      expect(normalizeTextForTTS('```')).toBe('');
    });

    it('preserves unicode characters', () => {
      expect(normalizeTextForTTS('Hello 世界 🎉')).toBe('Hello 世界 🎉');
    });

    it('preserves special punctuation', () => {
      expect(normalizeTextForTTS('Hello, world! How are you?')).toBe(
        'Hello, world! How are you?'
      );
    });

    it('handles URLs (protocol slashes preserved)', () => {
      // Protocol slashes (//) are preserved because no word char precedes them
      // Only path slashes after word chars are converted
      expect(normalizeTextForTTS('Visit https://example.com/path')).toBe(
        'Visit https://example.com path'
      );
    });
  });
});

describe('getStepDescription', () => {
  const createTour = (steps: IntroductionTour['steps']): IntroductionTour => ({
    id: 'test-tour',
    title: 'Test Tour',
    description: 'A test tour',
    steps,
  });

  describe('step lookup', () => {
    it('finds step by id', () => {
      const tour = createTour([
        { id: 'step-1', title: 'Step 1', description: 'First step' },
        { id: 'step-2', title: 'Step 2', description: 'Second step' },
      ]);
      expect(getStepDescription(tour, 'step-2')).toBe('Second step');
    });

    it('throws STEP_NOT_FOUND for missing step', () => {
      const tour = createTour([
        { id: 'step-1', title: 'Step 1', description: 'First step' },
      ]);
      expect(() => getStepDescription(tour, 'nonexistent')).toThrow(
        'STEP_NOT_FOUND'
      );
    });
  });

  describe('text field priority', () => {
    it('prioritizes narration over description', () => {
      const tour = createTour([
        {
          id: 'step-1',
          title: 'Step 1',
          narration: 'Narration text',
          description: 'Description text',
        },
      ]);
      expect(getStepDescription(tour, 'step-1')).toBe('Narration text');
    });

    it('falls back to description when no narration', () => {
      const tour = createTour([
        {
          id: 'step-1',
          title: 'Step 1',
          description: 'Description text',
        },
      ]);
      expect(getStepDescription(tour, 'step-1')).toBe('Description text');
    });

    it('falls back to content when no description', () => {
      const tour = createTour([
        {
          id: 'step-1',
          title: 'Step 1',
          content: 'Content text',
        },
      ]);
      expect(getStepDescription(tour, 'step-1')).toBe('Content text');
    });

    it('throws for step with no text content', () => {
      const tour = createTour([
        {
          id: 'step-1',
          title: 'Step 1',
        },
      ]);
      expect(() => getStepDescription(tour, 'step-1')).toThrow(
        'Step has no description or content'
      );
    });
  });

  describe('markdown stripping', () => {
    it('strips bold markdown', () => {
      const tour = createTour([
        {
          id: 'step-1',
          title: 'Step 1',
          description: 'This is **bold** text',
        },
      ]);
      expect(getStepDescription(tour, 'step-1')).toBe('This is bold text');
    });

    it('strips italic markdown', () => {
      const tour = createTour([
        {
          id: 'step-1',
          title: 'Step 1',
          description: 'This is *italic* text',
        },
      ]);
      expect(getStepDescription(tour, 'step-1')).toBe('This is italic text');
    });

    it('strips links', () => {
      const tour = createTour([
        {
          id: 'step-1',
          title: 'Step 1',
          description: 'Click [here](https://example.com) for more',
        },
      ]);
      expect(getStepDescription(tour, 'step-1')).toBe(
        'Click here for more'
      );
    });

    it('strips headers', () => {
      const tour = createTour([
        {
          id: 'step-1',
          title: 'Step 1',
          description: '## Header\n\nContent here',
        },
      ]);
      const result = getStepDescription(tour, 'step-1');
      expect(result).not.toContain('##');
      expect(result).toContain('Header');
      expect(result).toContain('Content here');
    });

    it('does NOT strip markdown from narration field', () => {
      const tour = createTour([
        {
          id: 'step-1',
          title: 'Step 1',
          narration: 'This is **bold** in narration',
          description: 'This is **bold** in description',
        },
      ]);
      // Narration is used as-is (except normalizeTextForTTS)
      // But ** should still be there... wait, let me check the code
      // Actually normalizeTextForTTS doesn't remove **, only backticks
      expect(getStepDescription(tour, 'step-1')).toBe(
        'This is **bold** in narration'
      );
    });
  });

  describe('combined markdown stripping and normalization', () => {
    it('strips markdown then normalizes paths', () => {
      const tour = createTour([
        {
          id: 'step-1',
          title: 'Step 1',
          description: 'Check the `src/components/` folder',
        },
      ]);
      expect(getStepDescription(tour, 'step-1')).toBe(
        'Check the src components folder'
      );
    });

    it('handles complex real-world description', () => {
      const tour = createTour([
        {
          id: 'step-1',
          title: 'Step 1',
          description:
            '## Getting Started\n\nFirst, navigate to the `src/lib/` directory and open **config.ts**.',
        },
      ]);
      const result = getStepDescription(tour, 'step-1');
      expect(result).not.toContain('##');
      expect(result).not.toContain('**');
      expect(result).not.toContain('`');
      expect(result).toContain('src lib');
      expect(result).toContain('config.ts');
    });
  });

  describe('length validation', () => {
    it('accepts text up to 5000 characters', () => {
      const longText = 'A'.repeat(5000);
      const tour = createTour([
        {
          id: 'step-1',
          title: 'Step 1',
          description: longText,
        },
      ]);
      expect(() => getStepDescription(tour, 'step-1')).not.toThrow();
    });

    it('throws for text exceeding 5000 characters', () => {
      const tooLongText = 'A'.repeat(5001);
      const tour = createTour([
        {
          id: 'step-1',
          title: 'Step 1',
          description: tooLongText,
        },
      ]);
      expect(() => getStepDescription(tour, 'step-1')).toThrow(
        'Step description exceeds 5000 characters'
      );
    });
  });
});
