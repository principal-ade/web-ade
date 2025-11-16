'use client';

import { useEffect, useState } from 'react';
import { useControlTowerClient } from '@/lib/control-tower';
import { useWebRTCSignaling } from '@/lib/webrtc';

/**
 * WebRTC Signaling Test Page
 *
 * This page demonstrates how to use the browser-compatible Control Tower client
 * for WebRTC signaling in web-ade.
 *
 * Usage:
 * 1. Update serverUrl with your traffic controller URL
 * 2. Update accessToken with a valid JWT token
 * 3. Update roomId with your test room ID
 * 4. Open this page in two browser tabs
 * 5. Click "Connect to Peer" and enter the other user's ID
 */
export default function WebRTCSignalingTestPage() {
  const [peerConnection, setPeerConnection] = useState<RTCPeerConnection | null>(null);
  const [targetUserId, setTargetUserId] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('Not connected');
  const [messages, setMessages] = useState<string[]>([]);

  // TODO: Replace with actual values
  const serverUrl = process.env.NEXT_PUBLIC_TRAFFIC_CONTROLLER_URL || 'wss://localhost:3000/ws';
  const accessToken = process.env.NEXT_PUBLIC_JWT_TOKEN || 'your-jwt-token-here';
  const roomId = 'test-webrtc-room';

  // Connect to Control Tower
  const {
    client,
    connected,
    error,
    roomId: currentRoomId,
  } = useControlTowerClient({
    serverUrl,
    accessToken,
    roomId,
    autoConnect: true,
  });

  // Set up WebRTC signaling
  const {
    sendOffer,
    sendAnswer,
    sendICECandidate,
    onOffer,
    onAnswer,
    onICECandidate,
  } = useWebRTCSignaling({ client: client! });

  const addMessage = (msg: string) => {
    setMessages(prev => [...prev, `[${new Date().toISOString()}] ${msg}`]);
  };

  // Set up WebRTC event listeners
  useEffect(() => {
    if (!client) return;

    addMessage('Setting up WebRTC listeners...');

    // Listen for incoming offers
    const unsubOffer = onOffer(async (fromUserId, offer) => {
      addMessage(`Received offer from ${fromUserId}`);

      // Create peer connection
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      });

      // Set up ICE candidate handler
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          addMessage('Sending ICE candidate...');
          sendICECandidate(fromUserId, event.candidate);
        }
      };

      // Set up connection state handler
      pc.onconnectionstatechange = () => {
        addMessage(`Connection state: ${pc.connectionState}`);
        setConnectionStatus(pc.connectionState);
      };

      // Set up data channel handler (receiver)
      pc.ondatachannel = (event) => {
        const dataChannel = event.channel;
        addMessage('Data channel received');

        dataChannel.onopen = () => {
          addMessage('Data channel opened');
        };

        dataChannel.onmessage = (event) => {
          addMessage(`Received: ${event.data}`);
        };
      };

      // Set remote description and create answer
      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Send answer back
      await sendAnswer(fromUserId, answer);
      addMessage('Sent answer');

      setPeerConnection(pc);
    });

    // Listen for incoming answers
    const unsubAnswer = onAnswer(async (fromUserId, answer) => {
      addMessage(`Received answer from ${fromUserId}`);

      if (peerConnection) {
        await peerConnection.setRemoteDescription(answer);
        addMessage('Set remote description');
      }
    });

    // Listen for ICE candidates
    const unsubICE = onICECandidate(async (fromUserId, candidate) => {
      addMessage(`Received ICE candidate from ${fromUserId}`);

      if (peerConnection) {
        await peerConnection.addIceCandidate(candidate);
        addMessage('Added ICE candidate');
      }
    });

    return () => {
      unsubOffer();
      unsubAnswer();
      unsubICE();
    };
  }, [client, peerConnection, onOffer, onAnswer, onICECandidate, sendAnswer, sendICECandidate]);

  // Initiate connection to peer
  const connectToPeer = async () => {
    if (!targetUserId) {
      addMessage('Error: Please enter target user ID');
      return;
    }

    addMessage(`Initiating connection to ${targetUserId}...`);

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });

    // Create data channel
    const dataChannel = pc.createDataChannel('test');
    dataChannel.onopen = () => {
      addMessage('Data channel opened');
      dataChannel.send('Hello from web-ade!');
    };
    dataChannel.onmessage = (event) => {
      addMessage(`Received: ${event.data}`);
    };

    // Set up ICE candidate handler
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        addMessage('Sending ICE candidate...');
        sendICECandidate(targetUserId, event.candidate);
      }
    };

    // Set up connection state handler
    pc.onconnectionstatechange = () => {
      addMessage(`Connection state: ${pc.connectionState}`);
      setConnectionStatus(pc.connectionState);
    };

    // Create and send offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await sendOffer(targetUserId, offer);
    addMessage('Sent offer');

    setPeerConnection(pc);
  };

  const getUserId = () => {
    return client?.getUserId() || 'unknown';
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">WebRTC Signaling Test</h1>

      {/* Connection Status */}
      <div className="mb-6 p-4 bg-gray-100 rounded">
        <h2 className="text-xl font-semibold mb-2">Control Tower Status</h2>
        <div className="space-y-1">
          <p>
            <span className="font-medium">Connection:</span>{' '}
            <span className={connected ? 'text-green-600' : 'text-red-600'}>
              {connected ? '✅ Connected' : '❌ Disconnected'}
            </span>
          </p>
          <p>
            <span className="font-medium">Room:</span> {currentRoomId || 'Not joined'}
          </p>
          <p>
            <span className="font-medium">User ID:</span> {getUserId()}
          </p>
          <p>
            <span className="font-medium">WebRTC Status:</span> {connectionStatus}
          </p>
          {error && (
            <p className="text-red-600">
              <span className="font-medium">Error:</span> {error.message}
            </p>
          )}
        </div>
      </div>

      {/* Connection Controls */}
      {connected && (
        <div className="mb-6 p-4 bg-blue-50 rounded">
          <h2 className="text-xl font-semibold mb-3">Connect to Peer</h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              placeholder="Enter target user ID"
              className="flex-1 px-3 py-2 border rounded"
            />
            <button
              onClick={connectToPeer}
              disabled={!targetUserId}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
            >
              Connect to Peer
            </button>
          </div>
          <p className="mt-2 text-sm text-gray-600">
            Your User ID: <code className="bg-gray-200 px-2 py-1 rounded">{getUserId()}</code>
          </p>
        </div>
      )}

      {/* Message Log */}
      <div className="p-4 bg-gray-50 rounded">
        <h2 className="text-xl font-semibold mb-3">Message Log</h2>
        <div className="space-y-1 max-h-96 overflow-y-auto font-mono text-sm">
          {messages.length === 0 ? (
            <p className="text-gray-500">No messages yet...</p>
          ) : (
            messages.map((msg, i) => (
              <div key={i} className="text-gray-700">
                {msg}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Instructions */}
      <div className="mt-6 p-4 bg-yellow-50 rounded">
        <h2 className="text-xl font-semibold mb-2">Instructions</h2>
        <ol className="list-decimal list-inside space-y-1 text-sm">
          <li>Update environment variables (NEXT_PUBLIC_TRAFFIC_CONTROLLER_URL, NEXT_PUBLIC_JWT_TOKEN)</li>
          <li>Open this page in two browser tabs/windows</li>
          <li>Note your User ID in each tab</li>
          <li>In one tab, enter the other tab&apos;s User ID and click &quot;Connect to Peer&quot;</li>
          <li>Watch the message log for WebRTC signaling flow</li>
          <li>Once connected, a test message will be sent via the data channel</li>
        </ol>
      </div>
    </div>
  );
}
