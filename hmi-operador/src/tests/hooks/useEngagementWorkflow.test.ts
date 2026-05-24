import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEngagementWorkflow } from '@/hooks/useEngagementWorkflow';
import { useRecommendationStore } from '@/store/recommendationStore';
import { MOCK_RECOMMENDATION } from '@/mocks/mockData';

function setupStoreWithRec(): void {
  useRecommendationStore.getState().upsert({
    ...MOCK_RECOMMENDATION,
    status: 'PENDING',
    operator_action_required: true,
  });
}

describe('useEngagementWorkflow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useRecommendationStore.getState().clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('comienza en estado IDLE', () => {
    const { result } = renderHook(() => useEngagementWorkflow());
    expect(result.current.state).toBe('IDLE');
    expect(result.current.recommendation).toBeNull();
  });

  it('transiciona a RECOMMENDATION_RECEIVED cuando hay recomendacion pendiente', () => {
    setupStoreWithRec();
    const { result } = renderHook(() => useEngagementWorkflow());
    expect(result.current.state).toBe('RECOMMENDATION_RECEIVED');
  });

  it('startAuthorization lleva a AWAITING_AUTH', () => {
    setupStoreWithRec();
    const { result } = renderHook(() => useEngagementWorkflow());
    act(() => {
      result.current.startAuthorization();
    });
    expect(result.current.state).toBe('AWAITING_AUTH');
  });

  it('reject lleva a ENGAGEMENT_FAILED', () => {
    setupStoreWithRec();
    const { result } = renderHook(() => useEngagementWorkflow());
    act(() => {
      result.current.reject();
    });
    expect(result.current.state).toBe('ENGAGEMENT_FAILED');
  });

  it('defer vuelve a IDLE', () => {
    setupStoreWithRec();
    const { result } = renderHook(() => useEngagementWorkflow());
    act(() => {
      result.current.defer();
    });
    expect(result.current.state).toBe('IDLE');
  });

  it('timeout lleva a ENGAGEMENT_EXPIRED', () => {
    setupStoreWithRec();
    const { result } = renderHook(() => useEngagementWorkflow());
    act(() => {
      result.current.startAuthorization();
    });
    expect(result.current.remainingTime).toBeGreaterThan(0);
    act(() => {
      vi.advanceTimersByTime(31_000);
    });
    expect(result.current.state).toBe('ENGAGEMENT_EXPIRED');
  });

  it('reset vuelve a IDLE', () => {
    setupStoreWithRec();
    const { result } = renderHook(() => useEngagementWorkflow());
    act(() => {
      result.current.startAuthorization();
    });
    expect(result.current.state).not.toBe('IDLE');
    act(() => {
      result.current.reset();
    });
    expect(result.current.state).toBe('IDLE');
    expect(result.current.timeline).toHaveLength(0);
  });

  it('timeline registra eventos en orden', () => {
    setupStoreWithRec();
    const { result } = renderHook(() => useEngagementWorkflow());
    expect(result.current.timeline.length).toBeGreaterThanOrEqual(1);
    act(() => {
      result.current.startAuthorization();
    });
    expect(result.current.timeline.length).toBeGreaterThanOrEqual(2);
    act(() => {
      result.current.reject();
    });
    expect(result.current.timeline.length).toBeGreaterThanOrEqual(3);
  });
});
