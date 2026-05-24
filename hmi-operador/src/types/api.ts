/**
 * Tipos compartidos de la API (auth, alertas, etc.).
 */

export type OperatorRole = 'VIGILANTE' | 'OPERADOR' | 'OFICIAL_TACTICO' | 'JEFE_FUEGO';

export interface OperatorIdentity {
  operator_id: string;
  display_name: string;
  role: OperatorRole;
  unit: string;
  rank: string;
  clearance: 'CONFIDENCIAL' | 'RESERVADO' | 'SECRETO';
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  requires_mfa: boolean;
  fido2_challenge: string | null;
  operator: OperatorIdentity;
}

export interface Fido2BeginResponse {
  challenge: string;
  rp_id: string;
  user_verification: 'required' | 'preferred' | 'discouraged';
  timeout_ms: number;
  allow_credentials: Array<{ id: string; type: 'public-key' }>;
}

export interface Fido2CompleteRequest {
  challenge: string;
  credential_id: string;
  signature: string;
  authenticator_data: string;
  client_data_json: string;
}

export interface Fido2CompleteResponse {
  access_token: string;
  mfa_satisfied: true;
  expires_in: number;
}

export type DefconLevel = 1 | 2 | 3 | 4 | 5;

export interface AlertMessage {
  alert_id: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  message: string;
  ts_ms: number;
  ack_required: boolean;
}

export interface SystemStatus {
  defcon: DefconLevel;
  ws_health: 'OK' | 'DEGRADED' | 'DOWN';
  latency_ms: number;
  sensors_active: number;
  sensors_total: number;
  interceptors_ready: number;
  interceptors_total: number;
  audit_chain_ok: boolean;
}

export interface EngagementAuthorizeRequest {
  recommendation_id: string;
  track_id: string;
  pin_hash: string; // ya hasheado en cliente (SHA-256 base64)
  fido2_assertion: Fido2CompleteRequest;
  decision: 'AUTHORIZE' | 'REJECT' | 'DEFER';
  reason?: string;
}

export interface EngagementAuthorizeResponse {
  authorized: boolean;
  recommendation_id: string;
  publish_topic: string;
  audit_event_id: string;
  ts_ms: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
