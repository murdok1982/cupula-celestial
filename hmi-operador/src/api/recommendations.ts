import { apiRequest } from './client';
import { env } from '@/env';
import type { Recommendation } from '@/types/recommendations';

export const recommendationsApi = {
  list(): Promise<Recommendation[]> {
    return apiRequest<Recommendation[]>('/v1/recommendations');
  },
  /** Solicita recomendacion al decision-engine directamente (depuracion / debug). */
  recommend(trackId: string): Promise<Recommendation> {
    return apiRequest<Recommendation>('/v1/recommend', {
      baseUrl: env.VITE_DECISION_URL,
      method: 'POST',
      body: { track_id: trackId },
    });
  },
};
