import { apiRequest } from './client';
import { env } from '@/env';
import type { Interceptor } from '@/types/interceptors';

export const interceptorsApi = {
  list(): Promise<Interceptor[]> {
    return apiRequest<Interceptor[]>('/v1/interceptors', {
      baseUrl: env.VITE_SWARM_URL,
    });
  },
  assign(payload: { track_id: string; interceptor_ids: string[] }): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>('/v1/wta/assign', {
      baseUrl: env.VITE_SWARM_URL,
      method: 'POST',
      body: payload,
    });
  },
};
