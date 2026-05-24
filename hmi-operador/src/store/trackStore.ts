/**
 * Store de pistas. Mantiene un mapa indexado por track_id y derivados.
 */
import { create } from 'zustand';
import type { Track } from '@/types/tracks';

interface TrackState {
  tracks: Record<string, Track>;
  selectedTrackId: string | null;
  upsertTrack(track: Track): void;
  upsertMany(tracks: Track[]): void;
  removeTrack(trackId: string): void;
  selectTrack(trackId: string | null): void;
  clear(): void;
}

export const useTrackStore = create<TrackState>((set) => ({
  tracks: {},
  selectedTrackId: null,
  upsertTrack(track): void {
    set((s) => ({ tracks: { ...s.tracks, [track.track_id]: track } }));
  },
  upsertMany(tracks): void {
    set((s) => {
      const next = { ...s.tracks };
      for (const t of tracks) next[t.track_id] = t;
      return { tracks: next };
    });
  },
  removeTrack(trackId): void {
    set((s) => {
      const next = { ...s.tracks };
      delete next[trackId];
      return {
        tracks: next,
        selectedTrackId: s.selectedTrackId === trackId ? null : s.selectedTrackId,
      };
    });
  },
  selectTrack(trackId): void {
    set({ selectedTrackId: trackId });
  },
  clear(): void {
    set({ tracks: {}, selectedTrackId: null });
  },
}));

export const selectAllTracks = (s: TrackState): Track[] => Object.values(s.tracks);
