'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

// Web Speech API types
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onspeechstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onspeechend: ((this: SpeechRecognition, ev: Event) => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export interface UseSpeechRecognitionOptions {
  /** Language for recognition (default: 'en-US') */
  lang?: string;
  /** Whether to return interim (partial) results */
  interimResults?: boolean;
  /** Callback when transcript is received */
  onTranscript?: (transcript: string, isFinal: boolean) => void;
  /** Callback when recognition starts */
  onStart?: () => void;
  /** Callback when recognition ends */
  onEnd?: () => void;
  /** Callback when an error occurs */
  onError?: (error: string) => void;
}

export interface UseSpeechRecognitionReturn {
  /** Whether speech recognition is supported in this browser */
  isSupported: boolean;
  /** Whether currently listening */
  isListening: boolean;
  /** Current transcript (interim or final) */
  transcript: string;
  /** Start listening */
  startListening: () => void;
  /** Stop listening */
  stopListening: () => void;
  /** Clear the transcript */
  clearTranscript: () => void;
}

/**
 * Hook for browser speech recognition (Web Speech API)
 * Works on iOS Safari (webkitSpeechRecognition) and Chrome/Edge (SpeechRecognition)
 */
export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {}
): UseSpeechRecognitionReturn {
  const {
    lang = 'en-US',
    interimResults = true,
    onTranscript,
    onStart,
    onEnd,
    onError,
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Check if speech recognition is supported (client-side only)
  useEffect(() => {
    setIsSupported(
      typeof window !== 'undefined' &&
      (!!window.SpeechRecognition || !!window.webkitSpeechRecognition)
    );
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  const startListening = useCallback(() => {
    if (!isSupported) {
      onError?.('Speech recognition is not supported in this browser');
      return;
    }

    // Create new recognition instance
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;

    const recognition = new SpeechRecognitionAPI();
    recognitionRef.current = recognition;

    recognition.continuous = false; // Single utterance mode works better on iOS
    recognition.interimResults = interimResults;
    recognition.lang = lang;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      onStart?.();
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
      onEnd?.();
    };

    recognition.onerror = (event) => {
      setIsListening(false);
      recognitionRef.current = null;

      // Handle common errors
      let errorMessage = 'Speech recognition error';
      switch (event.error) {
        case 'no-speech':
          errorMessage = 'No speech detected. Please try again.';
          break;
        case 'audio-capture':
          errorMessage = 'No microphone found or microphone access denied.';
          break;
        case 'not-allowed':
          errorMessage = 'Microphone access was denied. Please allow microphone access.';
          break;
        case 'network':
          errorMessage = 'Network error occurred. Please check your connection.';
          break;
        case 'aborted':
          // User or system aborted, not really an error
          return;
        default:
          errorMessage = event.message || `Speech recognition error: ${event.error}`;
      }

      onError?.(errorMessage);
    };

    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result && result[0]) {
          if (result.isFinal) {
            finalTranscript += result[0].transcript;
          } else {
            interimTranscript += result[0].transcript;
          }
        }
      }

      const currentTranscript = finalTranscript || interimTranscript;
      setTranscript(currentTranscript);
      onTranscript?.(currentTranscript, !!finalTranscript);
    };

    try {
      recognition.start();
    } catch {
      setIsListening(false);
      onError?.('Failed to start speech recognition');
    }
  }, [isSupported, lang, interimResults, onStart, onEnd, onError, onTranscript]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript('');
  }, []);

  return {
    isSupported,
    isListening,
    transcript,
    startListening,
    stopListening,
    clearTranscript,
  };
}
