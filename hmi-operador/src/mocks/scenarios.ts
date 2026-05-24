/**
 * Escenarios sinteticos para el simulador. Inyectan datos en stores via WS sintetico.
 */
import { useTrackStore } from '@/store/trackStore';
import { useRecommendationStore } from '@/store/recommendationStore';
import { useAlertStore } from '@/store/alertStore';
import { useConnectionStore } from '@/store/connectionStore';
import {
  MOCK_TRACKS,
  MOCK_RECOMMENDATION,
  MOCK_SYSTEM_STATUS,
} from './mockData';
import type { Track } from '@/types/tracks';

export type Scenario = 'idle' | 'single-hostile' | 'swarm' | 'spoofing' | 'fp-bird';

let intervalHandle: number | null = null;

export function loadScenario(scenario: Scenario): void {
  stopAnimation();
  useTrackStore.getState().clear();
  useRecommendationStore.getState().clear();
  useConnectionStore.getState().setSystemStatus(MOCK_SYSTEM_STATUS);

  switch (scenario) {
    case 'idle':
      useAlertStore.getState().push({
        alert_id: crypto.randomUUID(),
        severity: 'INFO',
        title: 'Sistema en vigilancia',
        message: 'Sin amenazas. Sensores nominales.',
        ts_ms: Date.now(),
        ack_required: false,
      });
      break;

    case 'single-hostile':
      MOCK_TRACKS.slice(0, 3).forEach((t) => useTrackStore.getState().upsertTrack(t));
      useRecommendationStore.getState().upsert(MOCK_RECOMMENDATION);
      useAlertStore.getState().push({
        alert_id: crypto.randomUUID(),
        severity: 'CRITICAL',
        title: 'HOSTIL CONFIRMADO',
        message: 'Pista T-4471 clasificada HOSTIL. Recomendacion LLM emitida.',
        ts_ms: Date.now(),
        ack_required: true,
      });
      animateTracks();
      break;

    case 'swarm':
      MOCK_TRACKS.forEach((t) => useTrackStore.getState().upsertTrack(t));
      // 8 hostiles adicionales en patron de enjambre
      const swarmTracks: Track[] = Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        const lat = 40.45 + Math.sin(angle) * 0.05;
        const lon = -3.70 + Math.cos(angle) * 0.05;
        return {
          track_id: `T-49${i.toString().padStart(2, '0')}`,
          position: { lat, lon, alt_m: 200 + i * 20 },
          velocity: { vx_ms: -Math.cos(angle) * 18, vy_ms: -Math.sin(angle) * 18, vz_ms: 0 },
          speed_ms: 18,
          heading_deg: (angle * 180) / Math.PI + 180,
          classification: 'HOSTIL_CONFIRMADO',
          classification_confidence: 0.88,
          iff_status: 'NO_RESPONSE',
          movement_mode: 'CV',
          tti_seconds: 25 + i * 2,
          range_m: 5000 + i * 200,
          sensors: [{ sensor: 'RADAR_AESA', weight: 0.7, last_update_ms: Date.now() }],
          last_update_ms: Date.now(),
          has_recommendation: i === 0,
        };
      });
      swarmTracks.forEach((t) => useTrackStore.getState().upsertTrack(t));
      useAlertStore.getState().push({
        alert_id: crypto.randomUUID(),
        severity: 'CRITICAL',
        title: 'ENJAMBRE DETECTADO',
        message: `${swarmTracks.length} pistas hostiles convergentes. Activando protocolo SWARM-1.`,
        ts_ms: Date.now(),
        ack_required: true,
      });
      useConnectionStore.getState().setSystemStatus({ ...MOCK_SYSTEM_STATUS, defcon: 2 });
      animateTracks();
      break;

    case 'spoofing':
      MOCK_TRACKS.slice(0, 2).forEach((t) => useTrackStore.getState().upsertTrack(t));
      useAlertStore.getState().push({
        alert_id: crypto.randomUUID(),
        severity: 'WARNING',
        title: 'POSIBLE SPOOFING GPS',
        message: 'Discrepancia entre ADS-B y radar primario. Verificacion en curso.',
        ts_ms: Date.now(),
        ack_required: true,
      });
      break;

    case 'fp-bird':
      MOCK_TRACKS.filter((t) => t.classification === 'AVE').forEach((t) =>
        useTrackStore.getState().upsertTrack(t),
      );
      useAlertStore.getState().push({
        alert_id: crypto.randomUUID(),
        severity: 'INFO',
        title: 'FAUNA DETECTADA',
        message: 'Pista T-4528 clasificada como ave migratoria. Sin accion requerida.',
        ts_ms: Date.now(),
        ack_required: false,
      });
      break;
  }
}

function animateTracks(): void {
  intervalHandle = window.setInterval(() => {
    const state = useTrackStore.getState();
    const updates: Track[] = [];
    for (const t of Object.values(state.tracks)) {
      const dt = 1; // 1s
      const newPos = {
        lat: t.position.lat + (t.velocity.vy_ms * dt) / 111_320,
        lon: t.position.lon + (t.velocity.vx_ms * dt) / (111_320 * Math.cos((t.position.lat * Math.PI) / 180)),
        alt_m: Math.max(0, t.position.alt_m + t.velocity.vz_ms * dt),
      };
      updates.push({
        ...t,
        position: newPos,
        tti_seconds: t.tti_seconds !== null ? Math.max(0, t.tti_seconds - dt) : null,
        last_update_ms: Date.now(),
      });
    }
    useTrackStore.getState().upsertMany(updates);
  }, 1000);
}

export function stopAnimation(): void {
  if (intervalHandle !== null) {
    window.clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
