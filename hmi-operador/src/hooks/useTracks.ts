import { useMemo } from 'react';
import { useTrackStore, selectAllTracks } from '@/store/trackStore';
import { sortByPriority } from '@/lib/tti';
import type { Track } from '@/types/tracks';

export function useTracks(): Track[] {
  const tracks = useTrackStore(selectAllTracks);
  return useMemo(() => sortByPriority(tracks), [tracks]);
}

export function useTrack(trackId: string | null): Track | null {
  return useTrackStore((s) => (trackId ? (s.tracks[trackId] ?? null) : null));
}

export function useSelectedTrack(): Track | null {
  const id = useTrackStore((s) => s.selectedTrackId);
  return useTrack(id);
}
