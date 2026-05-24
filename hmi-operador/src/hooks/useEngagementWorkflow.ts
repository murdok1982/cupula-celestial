import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRecommendationStore } from '@/store/recommendationStore';
import { useAlertStore } from '@/store/alertStore';
import { engagementApi } from '@/api/engagement';
import type { Recommendation } from '@/types/recommendations';
import type { EngagementDecision } from '@/components/tactical/EngagementAuthDialog';

export type EngagementState =
  | 'IDLE'
  | 'RECOMMENDATION_RECEIVED'
  | 'AWAITING_AUTH'
  | 'AUTH_IN_PROGRESS_PIN'
  | 'AUTH_IN_PROGRESS_FIDO2'
  | 'ENGAGEMENT_SENT'
  | 'ENGAGEMENT_CONFIRMED'
  | 'ENGAGEMENT_FAILED'
  | 'ENGAGEMENT_EXPIRED';

export interface EngagementWorkflowEvent {
  state: EngagementState;
  timestamp: number;
  detail?: string;
}

export interface UseEngagementWorkflowReturn {
  state: EngagementState;
  recommendation: Recommendation | null;
  remainingTime: number;
  timeline: EngagementWorkflowEvent[];
  startAuthorization: () => void;
  authorize: (payload: {
    decision: EngagementDecision;
    pin_hash: string;
    fido2_assertion: import('@/types/api').Fido2CompleteRequest;
    reason?: string;
  }) => Promise<void>;
  reject: () => void;
  defer: () => void;
  reset: () => void;
}

const ENGAGEMENT_TIMEOUT_MS = 30_000;

function pushEvent(
  prev: EngagementWorkflowEvent[],
  state: EngagementState,
  detail?: string,
): EngagementWorkflowEvent[] {
  const event: EngagementWorkflowEvent = { state, timestamp: Date.now(), detail };
  return [...prev, event];
}

export function useEngagementWorkflow(): UseEngagementWorkflowReturn {
  const [state, setState] = useState<EngagementState>('IDLE');
  const [timeline, setTimeline] = useState<EngagementWorkflowEvent[]>([]);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [remainingTime, setRemainingTime] = useState(0);
  const timerRef = useRef<number | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const recommendations = useRecommendationStore((s) => s.recommendations);
  const recommendation = useMemo(() => {
    return Object.values(recommendations).find(
      (r) => r.status === 'PENDING' && r.operator_action_required,
    ) ?? null;
  }, [recommendations]);

  // Watch for new recommendations
  useEffect(() => {
    if (recommendation && stateRef.current === 'IDLE') {
      setState('RECOMMENDATION_RECEIVED');
      setTimeline((prev) => pushEvent(prev, 'RECOMMENDATION_RECEIVED'));
    }
  }, [recommendation]);

  // Countdown timer for engagement window
  useEffect(() => {
    if (!deadline) return;
    const id = window.setInterval(() => {
      const remaining = Math.max(0, deadline - Date.now());
      setRemainingTime(remaining);
      if (remaining <= 0 && stateRef.current !== 'ENGAGEMENT_CONFIRMED' && stateRef.current !== 'ENGAGEMENT_FAILED') {
        setState('ENGAGEMENT_EXPIRED');
        setTimeline((prev) => pushEvent(prev, 'ENGAGEMENT_EXPIRED', 'Timeout de autorizacion'));
        setDeadline(null);
        if (recommendation) {
          useRecommendationStore.getState().setStatus(
            recommendation.recommendation_id ?? recommendation.track_id,
            'EXPIRED',
          );
          useAlertStore.getState().push({
            alert_id: crypto.randomUUID(),
            severity: 'WARNING',
            title: 'ENGAGEMENT EXPIRADO',
            message: `La ventana de autorizacion para pista ${recommendation.track_id} ha expirado.`,
            ts_ms: Date.now(),
            ack_required: true,
          });
        }
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [deadline, recommendation]);

  const startAuthorization = useCallback(() => {
    if (!recommendation) return;
    setState('AWAITING_AUTH');
    setTimeline((prev) => pushEvent(prev, 'AWAITING_AUTH'));
    setDeadline(Date.now() + ENGAGEMENT_TIMEOUT_MS);
    setRemainingTime(ENGAGEMENT_TIMEOUT_MS);
  }, [recommendation]);

  const authorize = useCallback(
    async (payload: {
      decision: EngagementDecision;
      pin_hash: string;
      fido2_assertion: import('@/types/api').Fido2CompleteRequest;
      reason?: string;
    }) => {
      if (!recommendation) return;
      setState('AUTH_IN_PROGRESS_PIN');
      setTimeline((prev) => pushEvent(prev, 'AUTH_IN_PROGRESS_PIN', 'PIN ingresado'));

      const recId = recommendation.recommendation_id ?? recommendation.track_id;
      try {
        const response = await engagementApi.authorize({
          recommendation_id: recId,
          track_id: recommendation.track_id,
          pin_hash: payload.pin_hash,
          fido2_assertion: payload.fido2_assertion,
          decision: payload.decision,
          reason: payload.reason,
        });

        setState(payload.decision === 'AUTHORIZE' ? 'ENGAGEMENT_CONFIRMED' : 'ENGAGEMENT_FAILED');
        setDeadline(null);
        setTimeline((prev) =>
          pushEvent(
            prev,
            payload.decision === 'AUTHORIZE' ? 'ENGAGEMENT_CONFIRMED' : 'ENGAGEMENT_FAILED',
            `Decision: ${payload.decision}`,
          ),
        );

        useRecommendationStore.getState().setStatus(
          recId,
          payload.decision === 'AUTHORIZE'
            ? 'AUTHORIZED'
            : payload.decision === 'REJECT'
              ? 'REJECTED'
              : 'DEFERRED',
        );

        useAlertStore.getState().push({
          alert_id: crypto.randomUUID(),
          severity: payload.decision === 'AUTHORIZE' ? 'CRITICAL' : 'INFO',
          title:
            payload.decision === 'AUTHORIZE'
              ? 'ENGAGEMENT AUTORIZADO'
              : payload.decision === 'REJECT'
                ? 'ENGAGEMENT RECHAZADO'
                : 'DECISION DIFERIDA',
          message: `Pista ${recommendation.track_id}. Evento registrado: ${response.audit_event_id}`,
          ts_ms: Date.now(),
          ack_required: false,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error en autorizacion';
        setState('ENGAGEMENT_FAILED');
        setTimeline((prev) => pushEvent(prev, 'ENGAGEMENT_FAILED', msg));
        useAlertStore.getState().push({
          alert_id: crypto.randomUUID(),
          severity: 'CRITICAL',
          title: 'ERROR DE AUTORIZACION',
          message: msg,
          ts_ms: Date.now(),
          ack_required: true,
        });
      }
    },
    [recommendation],
  );

  const reject = useCallback(() => {
    if (!recommendation) return;
    setDeadline(null);
    const recId = recommendation.recommendation_id ?? recommendation.track_id;
    useRecommendationStore.getState().setStatus(recId, 'REJECTED');
    useAlertStore.getState().push({
      alert_id: crypto.randomUUID(),
      severity: 'INFO',
      title: 'ENGAGEMENT RECHAZADO',
      message: `Pista ${recommendation.track_id}. Registrado en audit log.`,
      ts_ms: Date.now(),
      ack_required: false,
    });
    setState('ENGAGEMENT_FAILED');
    setTimeline((prev) => pushEvent(prev, 'ENGAGEMENT_FAILED', 'Rechazado por operador'));
  }, [recommendation]);

  const defer = useCallback(() => {
    if (!recommendation) return;
    setDeadline(null);
    const recId = recommendation.recommendation_id ?? recommendation.track_id;
    useRecommendationStore.getState().setStatus(recId, 'DEFERRED');
    useAlertStore.getState().push({
      alert_id: crypto.randomUUID(),
      severity: 'INFO',
      title: 'DECISION DIFERIDA',
      message: `Pista ${recommendation.track_id}. Se requiere reevaluacion.`,
      ts_ms: Date.now(),
      ack_required: false,
    });
    setState('IDLE');
    setTimeline((prev) => pushEvent(prev, 'IDLE', 'Decision diferida'));
  }, [recommendation]);

  const reset = useCallback(() => {
    setState('IDLE');
    setTimeline([]);
    setDeadline(null);
    setRemainingTime(0);
  }, []);

  return {
    state,
    recommendation,
    remainingTime,
    timeline,
    startAuthorization,
    authorize,
    reject,
    defer,
    reset,
  };
}
