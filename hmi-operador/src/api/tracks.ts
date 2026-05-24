import { apiRequest } from './client';
import type { Track } from '@/types/tracks';

export const tracksApi = {
  list(): Promise<Track[]> {
    return apiRequest<Track[]>('/v1/tracks');
  },
  get(trackId: string): Promise<Track> {
    return apiRequest<Track>(`/v1/tracks/${encodeURIComponent(trackId)}`);
  },
};
