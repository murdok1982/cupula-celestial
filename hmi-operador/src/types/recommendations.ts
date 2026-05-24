/**
 * Tipos de recomendacion del decision-engine (LLM tactico).
 * Espejo exacto del recommendation.schema.json del orquestador.
 */

export type RecommendationAction = 'OBSERVE' | 'TRACK' | 'WARN' | 'ENGAGE' | 'ABORT';

export type CollateralRisk = 'NEGLIGIBLE' | 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * Nivel jerarquico minimo que debe tener el operador para autorizar.
 * Espejo exacto de las cadenas que emite el decision-engine (ver contrato
 * en docs/03-orquestador-c2.md y backend `hmi-gateway`).
 */
export type AuthorizationLevel = 'OPS-OFFICER' | 'OFICIAL_TACTICO' | 'JEFE_FUEGO';

export interface EngagementWindow {
  start_ms: number;
  end_ms: number;
}

export interface Recommendation {
  /** ID unico de la recomendacion (no del track). */
  recommendation_id?: string;
  track_id: string;
  recommendation: RecommendationAction;
  interceptors_proposed: string[];
  engagement_window: EngagementWindow;
  pk_estimated: number; // 0..1
  collateral_risk: CollateralRisk;
  rationale: string;
  operator_action_required: boolean;
  authorization_level: AuthorizationLevel;
  roe_version?: string;
  policies_consulted?: string[];
  /** Timestamp emision (epoch ms). */
  issued_at_ms?: number;
  /** Estado en el HMI: pendiente, autorizada, rechazada, diferida, caducada. */
  status?: 'PENDING' | 'AUTHORIZED' | 'REJECTED' | 'DEFERRED' | 'EXPIRED';
}

export type RecommendationMessage = {
  type: 'recommendation.new' | 'recommendation.update';
  recommendation: Recommendation;
};
