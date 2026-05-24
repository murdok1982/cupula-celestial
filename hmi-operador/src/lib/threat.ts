/**
 * Mapeos de clasificacion de amenaza a colores y simbologia.
 * Basado en NATO APP-6D (replica del subset relevante).
 */
import type { ThreatClassification, IffStatus } from '@/types/tracks';
import type { CollateralRisk, RecommendationAction } from '@/types/recommendations';

export type ThreatColorKey = 'hostile' | 'friend' | 'neutral' | 'unknown' | 'pending';

export function threatColorKey(c: ThreatClassification): ThreatColorKey {
  switch (c) {
    case 'HOSTIL_CONFIRMADO':
    case 'AMENAZA_PROBABLE':
      return 'hostile';
    case 'MILITAR_AMIGO':
      return 'friend';
    case 'CIVIL':
    case 'MILITAR_NEUTRAL':
      return 'neutral';
    case 'AVE':
      return 'unknown';
    case 'DESCONOCIDO':
    default:
      return 'unknown';
  }
}

/** Color CSS para Cesium (RGBA 0..1 normalizado). */
export function threatRgba(c: ThreatClassification): [number, number, number, number] {
  switch (threatColorKey(c)) {
    case 'hostile':
      return [1.0, 0.22, 0.22, 0.95];
    case 'friend':
      return [0.29, 0.62, 1.0, 0.95];
    case 'neutral':
      return [0.18, 0.8, 0.44, 0.95];
    case 'unknown':
      return [1.0, 0.76, 0.03, 0.95];
    default:
      return [0.66, 0.55, 0.98, 0.95];
  }
}

/** Hex color para UI HTML. */
export function threatHex(c: ThreatClassification): string {
  switch (threatColorKey(c)) {
    case 'hostile':
      return '#ff3838';
    case 'friend':
      return '#4a9eff';
    case 'neutral':
      return '#2ecc71';
    case 'unknown':
      return '#ffc107';
    default:
      return '#a78bfa';
  }
}

export function threatLabel(c: ThreatClassification): string {
  switch (c) {
    case 'HOSTIL_CONFIRMADO':
      return 'HOSTIL';
    case 'AMENAZA_PROBABLE':
      return 'AMENAZA';
    case 'MILITAR_AMIGO':
      return 'AMIGO';
    case 'MILITAR_NEUTRAL':
      return 'NEUTRAL';
    case 'CIVIL':
      return 'CIVIL';
    case 'AVE':
      return 'AVE';
    case 'DESCONOCIDO':
    default:
      return 'DESCONOCIDO';
  }
}

export function iffLabel(s: IffStatus): string {
  switch (s) {
    case 'FRIEND':
      return 'IFF: FRIEND';
    case 'FOE':
      return 'IFF: FOE';
    case 'NEUTRAL':
      return 'IFF: NEUTRAL';
    case 'NO_RESPONSE':
      return 'IFF: NO-RESP';
    case 'UNKNOWN':
    default:
      return 'IFF: UNK';
  }
}

export function collateralRiskColor(r: CollateralRisk): string {
  switch (r) {
    case 'NEGLIGIBLE':
      return '#2ecc71';
    case 'LOW':
      return '#ffc107';
    case 'MEDIUM':
      return '#ff8800';
    case 'HIGH':
      return '#ff3838';
  }
}

export function recommendationLabel(a: RecommendationAction): string {
  switch (a) {
    case 'OBSERVE':
      return 'OBSERVAR';
    case 'TRACK':
      return 'SEGUIR';
    case 'WARN':
      return 'ADVERTIR';
    case 'ENGAGE':
      return 'NEUTRALIZAR';
    case 'ABORT':
      return 'ABORTAR';
  }
}
