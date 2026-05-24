/**
 * Hook que arranca el cliente WS una vez el operador esta autenticado.
 * Distribuye los mensajes a los stores correspondientes.
 */
import { useEffect, useRef } from 'react';
import { createWsClient, type WsClient } from '@/api/ws';
import { useAuthStore } from '@/store/authStore';
import { useTrackStore } from '@/store/trackStore';
import { useRecommendationStore } from '@/store/recommendationStore';
import { useAlertStore } from '@/store/alertStore';
import { useConnectionStore } from '@/store/connectionStore';

export function useWebSocket(): void {
  const accessToken = useAuthStore((s) => s.accessToken);
  const clientRef = useRef<WsClient | null>(null);

  useEffect(() => {
    if (!accessToken) {
      clientRef.current?.stop();
      clientRef.current = null;
      return undefined;
    }

    const upsertTrack = useTrackStore.getState().upsertTrack;
    const removeTrack = useTrackStore.getState().removeTrack;
    const upsertRec = useRecommendationStore.getState().upsert;
    const pushAlert = useAlertStore.getState().push;
    const setWsState = useConnectionStore.getState().setWsState;
    const setLatency = useConnectionStore.getState().setLatency;
    const setSystemStatus = useConnectionStore.getState().setSystemStatus;

    const client = createWsClient(
      () => useAuthStore.getState().accessToken,
      {
        onMessage(msg) {
          switch (msg.type) {
            case 'track.update':
              upsertTrack(msg.track);
              break;
            case 'track.drop':
              removeTrack(msg.track_id);
              break;
            case 'recommendation.new':
            case 'recommendation.update':
              upsertRec(msg.recommendation);
              break;
            case 'alert':
              pushAlert(msg.alert);
              break;
            case 'status':
              setSystemStatus(msg.status);
              break;
          }
        },
        onState(state) {
          setWsState(state);
        },
        onLatency(ms) {
          setLatency(ms);
        },
      },
    );

    clientRef.current = client;
    client.start();

    return () => {
      client.stop();
      clientRef.current = null;
    };
  }, [accessToken]);
}
