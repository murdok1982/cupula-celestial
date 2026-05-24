import { create } from 'zustand';
import type { Recommendation } from '@/types/recommendations';

interface RecommendationState {
  recommendations: Record<string, Recommendation>;
  /** id de la recomendacion actualmente seleccionada para autorizar. */
  activeRecommendationId: string | null;
  upsert(r: Recommendation): void;
  upsertMany(rs: Recommendation[]): void;
  setActive(id: string | null): void;
  setStatus(id: string, status: NonNullable<Recommendation['status']>): void;
  clear(): void;
}

function keyOf(r: Recommendation): string {
  return r.recommendation_id ?? r.track_id;
}

export const useRecommendationStore = create<RecommendationState>((set) => ({
  recommendations: {},
  activeRecommendationId: null,
  upsert(r): void {
    set((s) => ({ recommendations: { ...s.recommendations, [keyOf(r)]: { ...r, status: r.status ?? 'PENDING' } } }));
  },
  upsertMany(rs): void {
    set((s) => {
      const next = { ...s.recommendations };
      for (const r of rs) next[keyOf(r)] = { ...r, status: r.status ?? 'PENDING' };
      return { recommendations: next };
    });
  },
  setActive(id): void {
    set({ activeRecommendationId: id });
  },
  setStatus(id, status): void {
    set((s) => {
      const existing = s.recommendations[id];
      if (!existing) return s;
      return { recommendations: { ...s.recommendations, [id]: { ...existing, status } } };
    });
  },
  clear(): void {
    set({ recommendations: {}, activeRecommendationId: null });
  },
}));

export const selectAllRecommendations = (s: RecommendationState): Recommendation[] =>
  Object.values(s.recommendations);
