import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTrackStore } from '@/store/trackStore';
import { useTracks } from '@/hooks/useTracks';

describe('useTracks', () => {
  it('returns sorted tracks by priority', () => {
    const { result: store } = renderHook(() => useTrackStore());
    store.current.upsertTrack({
      track_id: 'T-1', priority: 5, speed_mps: 10,
    } as any);
    store.current.upsertTrack({
      track_id: 'T-2', priority: 9, speed_mps: 20,
    } as any);
    store.current.upsertTrack({
      track_id: 'T-3', priority: 1, speed_mps: 5,
    } as any);

    const { result: tracks } = renderHook(() => useTracks());
    expect(tracks.current.length).toBe(3);
  });
});
