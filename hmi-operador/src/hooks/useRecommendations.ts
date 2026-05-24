import { useMemo } from 'react';
import { useRecommendationStore, selectAllRecommendations } from '@/store/recommendationStore';
import type { Recommendation } from '@/types/recommendations';

export function useRecommendations(): Recommendation[] {
  const recs = useRecommendationStore(selectAllRecommendations);
  return useMemo(
    () =>
      [...recs].sort((a, b) => {
        const aPending = a.status === 'PENDING' ? 0 : 1;
        const bPending = b.status === 'PENDING' ? 0 : 1;
        if (aPending !== bPending) return aPending - bPending;
        return (b.issued_at_ms ?? 0) - (a.issued_at_ms ?? 0);
      }),
    [recs],
  );
}

export function useActiveRecommendation(): Recommendation | null {
  const id = useRecommendationStore((s) => s.activeRecommendationId);
  return useRecommendationStore((s) => (id ? (s.recommendations[id] ?? null) : null));
}

export function usePendingRecommendation(): Recommendation | null {
  const recs = useRecommendations();
  return recs.find((r) => r.status === 'PENDING' && r.operator_action_required) ?? null;
}
