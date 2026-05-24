/**
 * Datos mock realistas para desarrollo offline.
 */
import type { Track } from '@/types/tracks';
import type { Recommendation } from '@/types/recommendations';
import type { Interceptor } from '@/types/interceptors';
import type { AuditEvent, ChainVerifyResult } from '@/types/audit';
import type { OperatorIdentity, SystemStatus } from '@/types/api';

export const MOCK_OPERATOR: OperatorIdentity = {
  operator_id: 'OPS-0421',
  display_name: 'Garcia Hernandez',
  rank: 'TTE',
  role: 'OPERADOR',
  unit: 'MACOM-1',
  clearance: 'RESERVADO',
};

export const MOCK_OPERATOR_COMMANDER: OperatorIdentity = {
  operator_id: 'OPS-0099',
  display_name: 'Lopez Rivera',
  rank: 'CTE',
  role: 'JEFE_FUEGO',
  unit: 'MACOM-1',
  clearance: 'SECRETO',
};

const NOW = Date.now();

export const MOCK_TRACKS: Track[] = [
  {
    track_id: 'T-4471',
    position: { lat: 40.4452, lon: -3.6713, alt_m: 320 },
    velocity: { vx_ms: -15.2, vy_ms: -8.4, vz_ms: -0.5 },
    speed_ms: 17.5,
    heading_deg: 240,
    classification: 'HOSTIL_CONFIRMADO',
    classification_confidence: 0.94,
    iff_status: 'NO_RESPONSE',
    movement_mode: 'CV',
    tti_seconds: 18,
    range_m: 4280,
    sensors: [
      { sensor: 'RADAR_AESA', weight: 0.45, last_update_ms: NOW - 200 },
      { sensor: 'EO_IR', weight: 0.32, last_update_ms: NOW - 350 },
      { sensor: 'RF', weight: 0.23, last_update_ms: NOW - 410 },
    ],
    last_update_ms: NOW - 200,
    has_recommendation: true,
  },
  {
    track_id: 'T-4502',
    position: { lat: 40.4901, lon: -3.7521, alt_m: 180 },
    velocity: { vx_ms: 12.0, vy_ms: 3.0, vz_ms: 0.0 },
    speed_ms: 12.4,
    heading_deg: 75,
    classification: 'AMENAZA_PROBABLE',
    classification_confidence: 0.71,
    iff_status: 'UNKNOWN',
    movement_mode: 'CT',
    tti_seconds: 65,
    range_m: 7820,
    sensors: [
      { sensor: 'RADAR_AESA', weight: 0.52, last_update_ms: NOW - 180 },
      { sensor: 'ACUSTICA', weight: 0.28, last_update_ms: NOW - 500 },
      { sensor: 'RF', weight: 0.20, last_update_ms: NOW - 620 },
    ],
    last_update_ms: NOW - 180,
    has_recommendation: false,
  },
  {
    track_id: 'T-4519',
    position: { lat: 40.4032, lon: -3.7588, alt_m: 450 },
    velocity: { vx_ms: 0.5, vy_ms: -2.0, vz_ms: 0.0 },
    speed_ms: 2.1,
    heading_deg: 180,
    classification: 'CIVIL',
    classification_confidence: 0.88,
    iff_status: 'NEUTRAL',
    movement_mode: 'CV',
    tti_seconds: null,
    range_m: 9230,
    sensors: [
      { sensor: 'ADSB', weight: 0.6, last_update_ms: NOW - 100 },
      { sensor: 'EO_IR', weight: 0.4, last_update_ms: NOW - 280 },
    ],
    last_update_ms: NOW - 100,
    has_recommendation: false,
  },
  {
    track_id: 'T-4528',
    position: { lat: 40.5125, lon: -3.6502, alt_m: 80 },
    velocity: { vx_ms: -5.0, vy_ms: -1.0, vz_ms: 0.0 },
    speed_ms: 5.1,
    heading_deg: 195,
    classification: 'AVE',
    classification_confidence: 0.65,
    iff_status: 'NO_RESPONSE',
    movement_mode: 'CT',
    tti_seconds: null,
    range_m: 11200,
    sensors: [{ sensor: 'RADAR_AESA', weight: 1.0, last_update_ms: NOW - 240 }],
    last_update_ms: NOW - 240,
    has_recommendation: false,
  },
  {
    track_id: 'T-4533',
    position: { lat: 40.4290, lon: -3.6900, alt_m: 1200 },
    velocity: { vx_ms: 20.0, vy_ms: 15.0, vz_ms: 1.0 },
    speed_ms: 25.0,
    heading_deg: 53,
    classification: 'MILITAR_AMIGO',
    classification_confidence: 0.99,
    iff_status: 'FRIEND',
    movement_mode: 'CV',
    tti_seconds: null,
    range_m: 2800,
    sensors: [
      { sensor: 'RADAR_AESA', weight: 0.4, last_update_ms: NOW - 50 },
      { sensor: 'ADSB', weight: 0.6, last_update_ms: NOW - 50 },
    ],
    last_update_ms: NOW - 50,
    has_recommendation: false,
  },
];

export const MOCK_RECOMMENDATION: Recommendation = {
  recommendation_id: 'R-9821',
  track_id: 'T-4471',
  recommendation: 'ENGAGE',
  interceptors_proposed: ['I-12', 'I-19'],
  engagement_window: { start_ms: 0, end_ms: 4200 },
  pk_estimated: 0.89,
  collateral_risk: 'LOW',
  rationale:
    'Trayectoria balistica hacia activo critico C-3 (Subestacion electrica La Moraleja). Sin amigos identificados en linea de fuego. ROE-7 permite engagement automatico bajo nivel AMBER. Distancia minima a geofence sanitaria > 800 m.',
  operator_action_required: true,
  authorization_level: 'OPS-OFFICER',
  roe_version: 'ROE-2026-04',
  policies_consulted: ['ROE-7', 'ROE-12', 'GEOFENCE-CIVIL'],
  issued_at_ms: NOW - 1500,
  status: 'PENDING',
};

export const MOCK_INTERCEPTORS: Interceptor[] = [
  {
    interceptor_id: 'I-12',
    status: 'READY',
    payload: 'KINETIC',
    position: { lat: 40.4500, lon: -3.7100, alt_m: 0 },
    assigned_track_id: null,
    telemetry: {
      battery_pct: 98,
      altitude_m: 0,
      speed_ms: 0,
      heading_deg: 0,
      link_quality: 0.97,
      fuel_remaining_pct: 100,
    },
    pad: 'NE-1',
    last_update_ms: NOW,
  },
  {
    interceptor_id: 'I-19',
    status: 'READY',
    payload: 'NET_CAPTURE',
    position: { lat: 40.4502, lon: -3.7105, alt_m: 0 },
    assigned_track_id: null,
    telemetry: {
      battery_pct: 95,
      altitude_m: 0,
      speed_ms: 0,
      heading_deg: 0,
      link_quality: 0.95,
      fuel_remaining_pct: 100,
    },
    pad: 'NE-1',
    last_update_ms: NOW,
  },
  {
    interceptor_id: 'I-07',
    status: 'CRUISE',
    payload: 'KINETIC',
    position: { lat: 40.4450, lon: -3.6800, alt_m: 320 },
    assigned_track_id: null,
    telemetry: {
      battery_pct: 82,
      altitude_m: 320,
      speed_ms: 28,
      heading_deg: 87,
      link_quality: 0.88,
      fuel_remaining_pct: 75,
    },
    pad: 'NE-1',
    last_update_ms: NOW,
  },
  {
    interceptor_id: 'I-22',
    status: 'IDLE',
    payload: 'DIRECTED_RF',
    position: { lat: 40.3900, lon: -3.7300, alt_m: 0 },
    assigned_track_id: null,
    telemetry: {
      battery_pct: 100,
      altitude_m: 0,
      speed_ms: 0,
      heading_deg: 0,
      link_quality: 0.99,
      fuel_remaining_pct: 100,
    },
    pad: 'SW-2',
    last_update_ms: NOW,
  },
];

export const MOCK_SYSTEM_STATUS: SystemStatus = {
  defcon: 3,
  ws_health: 'OK',
  latency_ms: 24,
  sensors_active: 11,
  sensors_total: 12,
  interceptors_ready: 2,
  interceptors_total: 4,
  audit_chain_ok: true,
};

export const MOCK_AUDIT_EVENTS: AuditEvent[] = Array.from({ length: 32 }, (_, i) => {
  const kinds: AuditEvent['kind'][] = [
    'AUTH_LOGIN',
    'TRACK_OPENED',
    'CLASSIFICATION_UPDATED',
    'RECOMMENDATION_ISSUED',
    'ENGAGEMENT_AUTHORIZED',
    'ALERT_RAISED',
  ];
  const kind = kinds[i % kinds.length] ?? 'TRACK_OPENED';
  return {
    event_id: `evt-${1000 + i}`,
    seq: i + 1,
    kind,
    ts_ms: NOW - (32 - i) * 60_000,
    actor: i === 0 ? 'OPS-0421' : `OPS-${(421 + (i % 5)).toString().padStart(4, '0')}`,
    actor_role: i % 7 === 0 ? 'JEFE_FUEGO' : 'OPERADOR',
    payload: { ref: `T-${4400 + i}` },
    prev_hash: i === 0 ? '0'.repeat(64) : `h${i - 1}`.padEnd(64, '0'),
    hash: `h${i}`.padEnd(64, '0'),
    signature: `sig-${i}-stanag4778`,
  };
});

export const MOCK_CHAIN_VERIFY: ChainVerifyResult = {
  ok: true,
  total_events: MOCK_AUDIT_EVENTS.length,
  broken_at_seq: null,
  message: 'Cadena verificada. Todos los hashes encadenados correctamente.',
};
