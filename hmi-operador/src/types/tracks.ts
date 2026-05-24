/**
 * Tipos del track manager (fusion multisensor).
 * Espejo del JSON Schema de `orquestador/shared/schemas/track.schema.json`.
 */

export type ThreatClassification =
  | 'DESCONOCIDO'
  | 'AVE'
  | 'CIVIL'
  | 'MILITAR_AMIGO'
  | 'MILITAR_NEUTRAL'
  | 'AMENAZA_PROBABLE'
  | 'HOSTIL_CONFIRMADO';

export type IffStatus = 'UNKNOWN' | 'FRIEND' | 'NEUTRAL' | 'FOE' | 'NO_RESPONSE';

export type MovementMode = 'CV' | 'CA' | 'CT';

export type SensorKind = 'RADAR_AESA' | 'RADAR_PASIVO' | 'RF' | 'ACUSTICA' | 'EO_IR' | 'ADSB';

/** WGS84 - latitud, longitud, altura en metros sobre WGS84. */
export interface GeoPosition {
  lat: number;
  lon: number;
  alt_m: number;
}

export interface Velocity {
  vx_ms: number;
  vy_ms: number;
  vz_ms: number;
}

export interface SensorContribution {
  sensor: SensorKind;
  weight: number; // 0..1
  last_update_ms: number; // epoch ms
}

export interface Track {
  track_id: string;
  position: GeoPosition;
  velocity: Velocity;
  speed_ms: number;
  heading_deg: number;
  classification: ThreatClassification;
  classification_confidence: number;
  iff_status: IffStatus;
  movement_mode: MovementMode;
  /** Tiempo estimado al impacto sobre el activo defendido mas cercano. */
  tti_seconds: number | null;
  /** Distancia al activo defendido en metros. */
  range_m: number;
  /** Lista de sensores que contribuyen al track. */
  sensors: SensorContribution[];
  /** Ultimo timestamp (epoch ms). */
  last_update_ms: number;
  /** True si esta pista tiene una recomendacion LLM activa. */
  has_recommendation: boolean;
}

export type TrackUpdateMessage = {
  type: 'track.update';
  track: Track;
};

export type TrackDropMessage = {
  type: 'track.drop';
  track_id: string;
  reason: string;
};
