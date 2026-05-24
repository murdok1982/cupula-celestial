/**
 * Calculos relacionados con Time-To-Impact y prioridad de pista.
 */
import type { Track } from '@/types/tracks';

export type TtiSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Clasifica severidad por TTI segun umbrales operacionales C-UAS:
 *  - <10s: critical (engagement inminente)
 *  - <30s: high
 *  - <120s: medium
 *  - resto: low
 */
export function ttiSeverity(ttiSeconds: number | null): TtiSeverity {
  if (ttiSeconds === null || !Number.isFinite(ttiSeconds)) return 'low';
  if (ttiSeconds < 10) return 'critical';
  if (ttiSeconds < 30) return 'high';
  if (ttiSeconds < 120) return 'medium';
  return 'low';
}

/** Score numerico de prioridad: mayor = mas urgente. */
export function priorityScore(track: Track): number {
  const tti = track.tti_seconds ?? 1e9;
  const ttiScore = Math.max(0, 600 - tti); // 600s ventana
  const hostility =
    track.classification === 'HOSTIL_CONFIRMADO'
      ? 200
      : track.classification === 'AMENAZA_PROBABLE'
        ? 100
        : 0;
  const confidence = track.classification_confidence * 50;
  return ttiScore + hostility + confidence;
}

/** Ordena pistas: prioridad descendente. */
export function sortByPriority(tracks: Track[]): Track[] {
  return [...tracks].sort((a, b) => priorityScore(b) - priorityScore(a));
}
