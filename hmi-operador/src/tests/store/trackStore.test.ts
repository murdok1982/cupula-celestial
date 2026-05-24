import { describe, it, expect } from 'vitest';
import { useTrackStore } from '@/store/trackStore';

describe('trackStore', () => {
  it('adds a track', () => {
    useTrackStore.getState().upsertTrack({
      track_id: 'T-1',
      px_m: 100,
      py_m: 200,
    } as any);
    expect(useTrackStore.getState().tracks['T-1']).toBeDefined();
  });

  it('updates an existing track', () => {
    useTrackStore.getState().upsertTrack({
      track_id: 'T-2',
      px_m: 100,
    } as any);
    useTrackStore.getState().upsertTrack({
      track_id: 'T-2',
      px_m: 200,
    } as any);
    expect(useTrackStore.getState().tracks['T-2'].px_m).toBe(200);
  });

  it('deletes a track', () => {
    useTrackStore.getState().upsertTrack({
      track_id: 'T-3',
    } as any);
    useTrackStore.getState().removeTrack('T-3');
    expect(useTrackStore.getState().tracks['T-3']).toBeUndefined();
  });

  it('clears all tracks', () => {
    useTrackStore.getState().upsertTrack({ track_id: 'T-4' } as any);
    useTrackStore.getState().upsertTrack({ track_id: 'T-5' } as any);
    useTrackStore.getState().clear();
    expect(Object.keys(useTrackStore.getState().tracks)).toHaveLength(0);
  });
});
