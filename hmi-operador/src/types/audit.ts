/**
 * Tipos del audit log inmutable.
 * Cadena tipo Merkle, firmas STANAG 4774/4778.
 */

export type AuditEventKind =
  | 'AUTH_LOGIN'
  | 'AUTH_LOGOUT'
  | 'AUTH_MFA_OK'
  | 'AUTH_MFA_FAIL'
  | 'TRACK_OPENED'
  | 'TRACK_CLOSED'
  | 'CLASSIFICATION_UPDATED'
  | 'RECOMMENDATION_ISSUED'
  | 'ENGAGEMENT_AUTHORIZED'
  | 'ENGAGEMENT_REJECTED'
  | 'ENGAGEMENT_DEFERRED'
  | 'ENGAGEMENT_EXECUTED'
  | 'INTERCEPTOR_DEPLOYED'
  | 'ROE_UPDATED'
  | 'ALERT_RAISED'
  | 'SYSTEM_DEGRADED';

export interface AuditEvent {
  event_id: string;
  seq: number;
  kind: AuditEventKind;
  ts_ms: number;
  actor: string;
  actor_role: string;
  payload: Record<string, unknown>;
  prev_hash: string;
  hash: string;
  signature: string;
}

export interface ChainVerifyResult {
  ok: boolean;
  total_events: number;
  broken_at_seq: number | null;
  message: string;
}
