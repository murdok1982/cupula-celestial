import { useCallback, useEffect, useRef, useState } from 'react';
import { useConnectionStore } from '@/store/connectionStore';

export type ConnectionQuality = 'green' | 'yellow' | 'red';

export interface WebRTCStats {
  packetLoss: number;
  jitter: number;
  rtt: number;
  quality: ConnectionQuality;
  bitrate: number;
}

export interface UseWebRTCOptions {
  streamId: string;
  ws: WebSocket | null;
  iceServers?: RTCIceServer[];
}

export interface UseWebRTCReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  connectionState: RTCPeerConnectionState;
  stats: WebRTCStats | null;
  isRecording: boolean;
  startRecording: () => void;
  stopRecording: () => void;
  pipEnabled: boolean;
  togglePiP: () => void;
  isPiPActive: boolean;
}

const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;

function computeQuality(packetLoss: number, jitter: number, rtt: number): ConnectionQuality {
  if (packetLoss < 0.01 && jitter < 30 && rtt < 100) return 'green';
  if (packetLoss < 0.05 && jitter < 80 && rtt < 300) return 'yellow';
  return 'red';
}

function getDefaultIceServers(): RTCIceServer[] {
  try {
    const raw = import.meta.env.VITE_ICE_SERVERS as string | undefined;
    if (raw) return JSON.parse(raw) as RTCIceServer[];
  } catch {
    // Silently fall back to defaults
  }
  return [{ urls: 'stun:stun.l.google.com:19302' }];
}

export function useWebRTC({ streamId, ws, iceServers }: UseWebRTCOptions): UseWebRTCReturn {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<number | null>(null);
  const statsTimerRef = useRef<number | null>(null);

  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>('new');
  const [stats, setStats] = useState<WebRTCStats | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isPiPActive, setIsPiPActive] = useState(false);
  const [pipEnabled] = useState(() => Boolean(document.pictureInPictureEnabled));

  const cleanup = useCallback(() => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (statsTimerRef.current !== null) {
      window.clearInterval(statsTimerRef.current);
      statsTimerRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    chunksRef.current = [];
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsRecording(false);
  }, []);

  const startConnection = useCallback(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const pc = new RTCPeerConnection({
      iceServers: iceServers ?? getDefaultIceServers(),
    });

    pcRef.current = pc;

    pc.onconnectionstatechange = () => {
      setConnectionState(pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        cleanup();
        const delay = Math.min(
          BACKOFF_MAX_MS,
          BACKOFF_BASE_MS * 2 ** retryCountRef.current,
        );
        retryCountRef.current += 1;
        retryTimerRef.current = window.setTimeout(startConnection, delay);
      }
    };

    pc.ontrack = (event) => {
      mediaStreamRef.current = event.streams[0] ?? new MediaStream();
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStreamRef.current;
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'video:ice',
          stream_id: streamId,
          candidate: event.candidate.toJSON(),
        }));
      }
    };

    pc.onnegotiationneeded = async () => {
      try {
        await pc.setLocalDescription(await pc.createOffer({
          offerToReceiveVideo: true,
          offerToReceiveAudio: false,
        }));
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'video:offer',
            stream_id: streamId,
            sdp: pc.localDescription?.sdp,
          }));
        }
      } catch {
        // Failed to negotiate, will retry via connectionstate change
      }
    };

    const codecPreferences = [
      'video/H264',
      'video/VP8',
      'video/VP9',
    ];

    const transceiver = pc.addTransceiver('video', { direction: 'recvonly' });
    if (transceiver.setCodecPreferences && typeof RTCRtpReceiver.getCapabilities === 'function') {
      const caps = RTCRtpReceiver.getCapabilities('video');
      if (caps) {
        const orderedCodecs = codecPreferences
          .map((codec) => caps.codecs.find((c) => c.mimeType === codec))
          .filter((c): c is NonNullable<ReturnType<typeof caps.codecs.find>> => c != null);
        if (orderedCodecs.length > 0) {
          transceiver.setCodecPreferences(orderedCodecs);
        }
      }
    }

    retryCountRef.current = 0;

    // Start periodic stats reporting
    statsTimerRef.current = window.setInterval(async () => {
      if (!pcRef.current) return;
      try {
        const report = await pcRef.current.getStats();
        let packetLoss = 0;
        let jitter = 0;
        let rtt = 0;
        let totalPackets = 0;
        let lostPackets = 0;
        let bitrate = 0;

        report.forEach((stat) => {
          if (stat.type === 'inbound-rtp' && stat.kind === 'video') {
            totalPackets = stat.packetsReceived ?? 0;
            lostPackets = stat.packetsLost ?? 0;
            jitter = stat.jitter ?? 0;
            bitrate = stat.bitrate ?? 0;
          }
          if (stat.type === 'candidate-pair' && stat.state === 'succeeded') {
            rtt = (stat as RTCIceCandidatePairStats).currentRoundTripTime ?? 0;
            rtt = Math.round(rtt * 1000);
          }
        });

        packetLoss = totalPackets > 0 ? lostPackets / totalPackets : 0;
        jitter = Math.round(jitter * 1000);

        const newStats: WebRTCStats = {
          packetLoss,
          jitter,
          rtt,
          quality: computeQuality(packetLoss, jitter, rtt),
          bitrate,
        };

        setStats(newStats);

        useConnectionStore.getState().setLatency(rtt);
      } catch {
        // Stats collection failed, ignore
      }
    }, 5000);
  }, [ws, streamId, iceServers, cleanup]);

  useEffect(() => {
    if (!ws || !streamId) return;

    const handleMessage = (event: MessageEvent) => {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(event.data as string) as Record<string, unknown>;
      } catch {
        return;
      }

      if (data.stream_id !== streamId) return;

      const pc = pcRef.current;
      if (!pc) return;

      if (data.type === 'video:answer' && typeof data.sdp === 'string') {
        pc.setRemoteDescription({ type: 'answer', sdp: data.sdp }).catch(() => {});
      }

      if (data.type === 'video:ice' && data.candidate) {
        pc.addIceCandidate(new RTCIceCandidate(data.candidate as RTCIceCandidateInit)).catch(() => {});
      }
    };

    ws.addEventListener('message', handleMessage);

    // Check if WebRTC is supported
    try {
      if (typeof RTCPeerConnection === 'undefined') {
        // WebRTC not available, keep showing the stub
        return;
      }
      startConnection();
    } catch {
      // WebRTC not available
    }

    return () => {
      ws.removeEventListener('message', handleMessage);
      cleanup();
    };
  }, [ws, streamId, startConnection, cleanup]);

  const startRecording = useCallback(() => {
    if (!mediaStreamRef.current || recorderRef.current) return;
    try {
      chunksRef.current = [];
      const recorder = new MediaRecorder(mediaStreamRef.current, {
        mimeType: 'video/webm;codecs=vp9',
      });
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `engagement-${streamId}-${Date.now()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        chunksRef.current = [];
        recorderRef.current = null;
      };

      recorder.start();
      setIsRecording(true);
    } catch {
      // Recording not supported
    }
  }, [streamId]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  const togglePiP = useCallback(async () => {
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPiPActive(false);
      } else {
        await videoRef.current.requestPictureInPicture();
        setIsPiPActive(true);
      }
    } catch {
      setIsPiPActive(false);
    }
  }, []);

  return {
    videoRef,
    connectionState,
    stats,
    isRecording,
    startRecording,
    stopRecording,
    pipEnabled,
    togglePiP,
    isPiPActive,
  };
}
