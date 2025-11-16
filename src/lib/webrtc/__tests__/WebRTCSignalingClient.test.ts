/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-function-type */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebRTCSignalingClient } from '../WebRTCSignalingClient';
import type { BaseClient, Event } from '@principal-ai/control-tower-core';

// Mock BaseClient
class MockBaseClient {
  private eventHandlers: Map<string, Set<Function>> = new Map();
  private mockUserId = 'test-user-123';

  on(event: string, handler: Function) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);

    return () => {
      this.eventHandlers.get(event)?.delete(handler);
    };
  }

  async broadcast(event: Event) {
    // Mock broadcast - just store for verification
  }

  getUserId() {
    return this.mockUserId;
  }

  // Test helper to simulate incoming events
  simulateEvent(event: any) {
    const handlers = this.eventHandlers.get('event_received');
    if (handlers) {
      handlers.forEach(handler => handler({ event }));
    }
  }
}

describe('WebRTCSignalingClient', () => {
  let mockClient: MockBaseClient;
  let signalingClient: WebRTCSignalingClient;

  beforeEach(() => {
    mockClient = new MockBaseClient();
    signalingClient = new WebRTCSignalingClient(mockClient as unknown as BaseClient);
  });

  describe('sendOffer', () => {
    it('should broadcast offer message', async () => {
      const broadcastSpy = vi.spyOn(mockClient, 'broadcast');

      const offer: RTCSessionDescriptionInit = {
        type: 'offer',
        sdp: 'test-sdp-offer',
      };

      await signalingClient.sendOffer('target-user', offer);

      expect(broadcastSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'webrtc:offer',
          data: {
            targetPeerId: 'target-user',
            sdp: 'test-sdp-offer',
          },
          metadata: expect.objectContaining({
            from: 'test-user-123',
          }),
        })
      );
    });
  });

  describe('sendAnswer', () => {
    it('should broadcast answer message', async () => {
      const broadcastSpy = vi.spyOn(mockClient, 'broadcast');

      const answer: RTCSessionDescriptionInit = {
        type: 'answer',
        sdp: 'test-sdp-answer',
      };

      await signalingClient.sendAnswer('target-user', answer);

      expect(broadcastSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'webrtc:answer',
          data: {
            targetPeerId: 'target-user',
            sdp: 'test-sdp-answer',
          },
        })
      );
    });
  });

  describe('sendICECandidate', () => {
    it('should broadcast ICE candidate message', async () => {
      const broadcastSpy = vi.spyOn(mockClient, 'broadcast');

      const candidate = {
        candidate: 'candidate:test',
        sdpMLineIndex: 0,
        sdpMid: '0',
        toJSON: () => ({
          candidate: 'candidate:test',
          sdpMLineIndex: 0,
          sdpMid: '0',
        }),
      } as RTCIceCandidate;

      await signalingClient.sendICECandidate('target-user', candidate);

      expect(broadcastSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'webrtc:ice-candidate',
          data: expect.objectContaining({
            targetPeerId: 'target-user',
            candidate: expect.objectContaining({
              candidate: 'candidate:test',
            }),
          }),
        })
      );
    });
  });

  describe('onOffer', () => {
    it('should call handler when offer received', () => {
      const offerHandler = vi.fn();
      signalingClient.onOffer(offerHandler);

      // Simulate incoming offer
      mockClient.simulateEvent({
        type: 'webrtc:offer',
        data: {
          targetPeerId: 'test-user-123',
          sdp: 'incoming-offer-sdp',
        },
        metadata: {
          from: 'sender-user',
        },
      });

      expect(offerHandler).toHaveBeenCalledWith(
        'sender-user',
        expect.objectContaining({
          type: 'offer',
          sdp: 'incoming-offer-sdp',
        })
      );
    });

    it('should not call handler for offers to other users', () => {
      const offerHandler = vi.fn();
      signalingClient.onOffer(offerHandler);

      // Simulate offer for different user
      mockClient.simulateEvent({
        type: 'webrtc:offer',
        data: {
          targetPeerId: 'different-user',
          sdp: 'offer-sdp',
        },
        metadata: {
          from: 'sender-user',
        },
      });

      expect(offerHandler).not.toHaveBeenCalled();
    });

    it('should support unsubscribing', () => {
      const offerHandler = vi.fn();
      const unsubscribe = signalingClient.onOffer(offerHandler);

      unsubscribe();

      mockClient.simulateEvent({
        type: 'webrtc:offer',
        data: {
          targetPeerId: 'test-user-123',
          sdp: 'offer-sdp',
        },
        metadata: {
          from: 'sender-user',
        },
      });

      expect(offerHandler).not.toHaveBeenCalled();
    });
  });

  describe('onAnswer', () => {
    it('should call handler when answer received', () => {
      const answerHandler = vi.fn();
      signalingClient.onAnswer(answerHandler);

      mockClient.simulateEvent({
        type: 'webrtc:answer',
        data: {
          targetPeerId: 'test-user-123',
          sdp: 'answer-sdp',
        },
        metadata: {
          from: 'sender-user',
        },
      });

      expect(answerHandler).toHaveBeenCalledWith(
        'sender-user',
        expect.objectContaining({
          type: 'answer',
          sdp: 'answer-sdp',
        })
      );
    });
  });

  describe('onICECandidate', () => {
    it('should call handler when ICE candidate received', () => {
      const iceHandler = vi.fn();
      signalingClient.onICECandidate(iceHandler);

      const candidateData = {
        candidate: 'candidate:test',
        sdpMLineIndex: 0,
        sdpMid: '0',
      };

      mockClient.simulateEvent({
        type: 'webrtc:ice-candidate',
        data: {
          targetPeerId: 'test-user-123',
          candidate: candidateData,
        },
        metadata: {
          from: 'sender-user',
        },
      });

      expect(iceHandler).toHaveBeenCalledWith('sender-user', candidateData);
    });
  });

  describe('message filtering', () => {
    it('should ignore messages without sender info', () => {
      const offerHandler = vi.fn();
      signalingClient.onOffer(offerHandler);

      mockClient.simulateEvent({
        type: 'webrtc:offer',
        data: {
          targetPeerId: 'test-user-123',
          sdp: 'offer-sdp',
        },
        // No metadata.from
      });

      expect(offerHandler).not.toHaveBeenCalled();
    });

    it('should ignore non-webrtc messages', () => {
      const offerHandler = vi.fn();
      signalingClient.onOffer(offerHandler);

      mockClient.simulateEvent({
        type: 'custom:message',
        data: {
          targetPeerId: 'test-user-123',
        },
        metadata: {
          from: 'sender-user',
        },
      });

      expect(offerHandler).not.toHaveBeenCalled();
    });
  });

  describe('multiple handlers', () => {
    it('should call all registered handlers', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      signalingClient.onOffer(handler1);
      signalingClient.onOffer(handler2);

      mockClient.simulateEvent({
        type: 'webrtc:offer',
        data: {
          targetPeerId: 'test-user-123',
          sdp: 'offer-sdp',
        },
        metadata: {
          from: 'sender-user',
        },
      });

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });
});
