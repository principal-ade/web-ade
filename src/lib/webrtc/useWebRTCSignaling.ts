'use client';

import { useEffect, useState, useCallback } from 'react';
import type { BaseClient } from '@principal-ai/control-tower-core';
import { WebRTCSignalingClient } from './WebRTCSignalingClient';

export interface UseWebRTCSignalingOptions {
  client: BaseClient;
}

export function useWebRTCSignaling(options: UseWebRTCSignalingOptions) {
  const [signalingClient, setSignalingClient] = useState<WebRTCSignalingClient | null>(null);

  useEffect(() => {
    const client = new WebRTCSignalingClient(options.client);
    setSignalingClient(client);

    return () => {
      // Cleanup if needed
    };
  }, [options.client]);

  const sendOffer = useCallback(
    async (targetUserId: string, offer: RTCSessionDescriptionInit) => {
      if (!signalingClient) {
        throw new Error('Signaling client not initialized');
      }
      await signalingClient.sendOffer(targetUserId, offer);
    },
    [signalingClient]
  );

  const sendAnswer = useCallback(
    async (targetUserId: string, answer: RTCSessionDescriptionInit) => {
      if (!signalingClient) {
        throw new Error('Signaling client not initialized');
      }
      await signalingClient.sendAnswer(targetUserId, answer);
    },
    [signalingClient]
  );

  const sendICECandidate = useCallback(
    async (targetUserId: string, candidate: RTCIceCandidate) => {
      if (!signalingClient) {
        throw new Error('Signaling client not initialized');
      }
      await signalingClient.sendICECandidate(targetUserId, candidate);
    },
    [signalingClient]
  );

  const onOffer = useCallback(
    (handler: (from: string, offer: RTCSessionDescriptionInit) => void) => {
      if (!signalingClient) return () => {};
      return signalingClient.onOffer(handler);
    },
    [signalingClient]
  );

  const onAnswer = useCallback(
    (handler: (from: string, answer: RTCSessionDescriptionInit) => void) => {
      if (!signalingClient) return () => {};
      return signalingClient.onAnswer(handler);
    },
    [signalingClient]
  );

  const onICECandidate = useCallback(
    (handler: (from: string, candidate: RTCIceCandidateInit) => void) => {
      if (!signalingClient) return () => {};
      return signalingClient.onICECandidate(handler);
    },
    [signalingClient]
  );

  return {
    sendOffer,
    sendAnswer,
    sendICECandidate,
    onOffer,
    onAnswer,
    onICECandidate,
  };
}
