/**
 * Tipos de interceptores (capa 4 - efectores).
 */

export type InterceptorStatus =
  | 'IDLE' // en base
  | 'READY' // listo en pad
  | 'LAUNCH' // despegando
  | 'CRUISE' // en ruta
  | 'TERMINAL' // homing terminal
  | 'RTB' // return to base
  | 'LOST' // perdido / comm down
  | 'DESTROYED';

export type InterceptorPayload = 'KINETIC' | 'NET_CAPTURE' | 'DIRECTED_RF' | 'NONE';

export interface InterceptorTelemetry {
  battery_pct: number;
  altitude_m: number;
  speed_ms: number;
  heading_deg: number;
  link_quality: number; // 0..1
  fuel_remaining_pct: number;
}

export interface Interceptor {
  interceptor_id: string;
  status: InterceptorStatus;
  payload: InterceptorPayload;
  position: { lat: number; lon: number; alt_m: number };
  assigned_track_id: string | null;
  telemetry: InterceptorTelemetry;
  pad: string;
  last_update_ms: number;
}
