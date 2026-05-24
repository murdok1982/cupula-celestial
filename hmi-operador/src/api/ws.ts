/**
 * Cliente WebSocket con reconexion exponencial.
 * Multiplexa los mensajes del hmi-gateway:
 *  - tracks.confirmed (track.update / track.drop)
 *  - recommendations (recommendation.new / recommendation.update)
 *  - alerts (alert)
 *  - system_status (status)
 */
import { env } from '@/env';
import type { TrackUpdateMessage, TrackDropMessage } from '@/types/tracks';
import type { RecommendationMessage } from '@/types/recommendations';
import type { AlertMessage, SystemStatus } from '@/types/api';

export type WsMessage =
  | TrackUpdateMessage
  | TrackDropMessage
  | RecommendationMessage
  | { type: 'alert'; alert: AlertMessage }
  | { type: 'status'; status: SystemStatus }
  | { type: 'pong'; ts_ms: number };

export type WsConnectionState = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

export interface WsClient {
  start(): void;
  stop(): void;
  isOpen(): boolean;
  send(payload: unknown): void;
}

export interface WsCallbacks {
  onMessage(msg: WsMessage): void;
  onState(state: WsConnectionState): void;
  onLatency(ms: number): void;
}

const BACKOFF_MIN_MS = 500;
const BACKOFF_MAX_MS = 15_000;
const PING_INTERVAL_MS = 5_000;

export function createWsClient(getToken: () => string | null, cb: WsCallbacks): WsClient {
  let ws: WebSocket | null = null;
  let reconnectAttempt = 0;
  let stopped = false;
  let pingTimer: number | null = null;
  let lastPingMs = 0;

  function setState(s: WsConnectionState): void {
    cb.onState(s);
  }

  function scheduleReconnect(): void {
    if (stopped) return;
    const delay = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** reconnectAttempt);
    reconnectAttempt += 1;
    window.setTimeout(connect, delay);
  }

  function startPing(): void {
    stopPing();
    pingTimer = window.setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        lastPingMs = Date.now();
        ws.send(JSON.stringify({ type: 'ping', ts_ms: lastPingMs }));
      }
    }, PING_INTERVAL_MS);
  }

  function stopPing(): void {
    if (pingTimer !== null) {
      window.clearInterval(pingTimer);
      pingTimer = null;
    }
  }

  function connect(): void {
    if (stopped) return;
    const token = getToken();
    if (!token) {
      setState('closed');
      return;
    }
    setState('connecting');
    const url = `${env.VITE_WS_URL}?token=${encodeURIComponent(token)}`;
    try {
      ws = new WebSocket(url);
    } catch {
      setState('error');
      scheduleReconnect();
      return;
    }

    ws.onopen = (): void => {
      reconnectAttempt = 0;
      setState('open');
      startPing();
    };

    ws.onmessage = (ev: MessageEvent<string>): void => {
      try {
        const parsed = JSON.parse(ev.data) as WsMessage;
        if (parsed.type === 'pong') {
          const rtt = Date.now() - parsed.ts_ms;
          cb.onLatency(rtt);
          return;
        }
        cb.onMessage(parsed);
      } catch {
        // Mensaje invalido, ignorar
      }
    };

    ws.onerror = (): void => {
      setState('error');
    };

    ws.onclose = (): void => {
      stopPing();
      setState('closed');
      if (!stopped) scheduleReconnect();
    };
  }

  return {
    start(): void {
      stopped = false;
      reconnectAttempt = 0;
      connect();
    },
    stop(): void {
      stopped = true;
      stopPing();
      if (ws) {
        ws.close(1000, 'client_stop');
        ws = null;
      }
      setState('idle');
    },
    isOpen(): boolean {
      return ws?.readyState === WebSocket.OPEN;
    },
    send(payload: unknown): void {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
      }
    },
  };
}
