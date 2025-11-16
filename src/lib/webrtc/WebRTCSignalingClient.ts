'use client';

import type { BaseClient, Event } from '@principal-ai/control-tower-core';

type WebRTCSignalingMessage = Event & {
  data?: {
    sdp?: string;
    candidate?: RTCIceCandidate;
    targetPeerId?: string;
  };
  metadata?: {
    from?: string;
  };
};

export interface WebRTCSignalData {
  targetPeerId: string;
  sdp?: string;
  candidate?: RTCIceCandidateInit;
}

export interface WebRTCOffer extends WebRTCSignalData {
  type: 'offer';
  sdp: string;
}

export interface WebRTCAnswer extends WebRTCSignalData {
  type: 'answer';
  sdp: string;
}

export interface WebRTCICECandidate extends WebRTCSignalData {
  type: 'ice-candidate';
  candidate: RTCIceCandidateInit;
}

/**
 * WebRTC Signaling Client - High-level wrapper around BaseClient for WebRTC
 *
 * This client provides a simplified API for WebRTC peer-to-peer signaling
 * using the Control Tower Core BaseClient as the transport layer.
 */
export class WebRTCSignalingClient {
  private offerHandlers: Set<(from: string, offer: RTCSessionDescriptionInit) => void> = new Set();
  private answerHandlers: Set<(from: string, answer: RTCSessionDescriptionInit) => void> = new Set();
  private iceCandidateHandlers: Set<(from: string, candidate: RTCIceCandidateInit) => void> = new Set();

  constructor(private baseClient: BaseClient) {
    this.setupSignalingListeners();
  }

  /**
   * Send WebRTC offer to target peer
   */
  async sendOffer(targetUserId: string, offer: RTCSessionDescriptionInit): Promise<void> {
    const message = {
      type: 'webrtc:offer',
      data: {
        targetPeerId: targetUserId,
        sdp: offer.sdp,
      },
      metadata: {
        from: this.baseClient.getUserId(),
        timestamp: Date.now(),
      },
    };

    await this.baseClient.broadcast(message as unknown as Event);
  }

  /**
   * Send WebRTC answer to target peer
   */
  async sendAnswer(targetUserId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    const message = {
      type: 'webrtc:answer',
      data: {
        targetPeerId: targetUserId,
        sdp: answer.sdp,
      },
      metadata: {
        from: this.baseClient.getUserId(),
        timestamp: Date.now(),
      },
    };

    await this.baseClient.broadcast(message as unknown as Event);
  }

  /**
   * Send ICE candidate to target peer
   */
  async sendICECandidate(targetUserId: string, candidate: RTCIceCandidate): Promise<void> {
    const message = {
      type: 'webrtc:ice-candidate',
      data: {
        targetPeerId: targetUserId,
        candidate: candidate.toJSON(),
      },
      metadata: {
        from: this.baseClient.getUserId(),
        timestamp: Date.now(),
      },
    };

    await this.baseClient.broadcast(message as unknown as Event);
  }

  /**
   * Listen for incoming WebRTC offers
   */
  onOffer(handler: (from: string, offer: RTCSessionDescriptionInit) => void): () => void {
    this.offerHandlers.add(handler);
    return () => this.offerHandlers.delete(handler);
  }

  /**
   * Listen for incoming WebRTC answers
   */
  onAnswer(handler: (from: string, answer: RTCSessionDescriptionInit) => void): () => void {
    this.answerHandlers.add(handler);
    return () => this.answerHandlers.delete(handler);
  }

  /**
   * Listen for incoming ICE candidates
   */
  onICECandidate(handler: (from: string, candidate: RTCIceCandidateInit) => void): () => void {
    this.iceCandidateHandlers.add(handler);
    return () => this.iceCandidateHandlers.delete(handler);
  }

  /**
   * Set up listeners for WebRTC signaling messages from BaseClient
   */
  private setupSignalingListeners(): void {
    this.baseClient.on('event_received', ({ event }) => {
      const message = event as WebRTCSignalingMessage;
      const myUserId = this.baseClient.getUserId();

      // Only process messages targeted at this user
      if (message.data?.targetPeerId !== myUserId) {
        return;
      }

      const fromUserId = message.metadata?.from;
      if (!fromUserId) {
        console.warn('[WebRTCSignaling] Received message without sender info');
        return;
      }

      // WebRTC messages use custom event types not in the standard Event union
      const messageType = message.type as string;

      switch (messageType) {
        case 'webrtc:offer':
          if (message.data?.sdp) {
            const offer: RTCSessionDescriptionInit = {
              type: 'offer',
              sdp: message.data.sdp,
            };
            this.offerHandlers.forEach(handler => handler(fromUserId, offer));
          }
          break;

        case 'webrtc:answer':
          if (message.data?.sdp) {
            const answer: RTCSessionDescriptionInit = {
              type: 'answer',
              sdp: message.data.sdp,
            };
            this.answerHandlers.forEach(handler => handler(fromUserId, answer));
          }
          break;

        case 'webrtc:ice-candidate':
          if (message.data?.candidate) {
            this.iceCandidateHandlers.forEach(handler =>
              handler(fromUserId, message.data.candidate!)
            );
          }
          break;
      }
    });
  }
}
