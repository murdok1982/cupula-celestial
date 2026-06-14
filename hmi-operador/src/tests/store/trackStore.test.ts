import { describe, it, expect, beforeEach } from 'vitest';
import { useTrackStore } from '@/store/trackStore';
import type { Track } from '@/types/tracks';

function makeTrack(id: string, overrides?: Partial<Track>): Track {
  return {
    track_id: id,
    position: { lat: 40.0, lon: -3.5, alt_m: 1500 },
    velocity: { vx_ms: 50, vy_ms: 30, vz_ms: 0 },
    speed_ms: 58.3,
    heading_deg: 30,
    classification: 'DESCONOCIDO',
    classification_confidence: 0.7,
    iff_status: 'UNKNOWN',
    movement_mode: 'CV',
    tti_seconds: null,
    range_m: 12000,
    sensors: [{ sensor: 'RADAR_AESA', weight: 1.0, last_update_ms: Date.now() }],
    last_update_ms: Date.now(),
    has_recommendation: false,
    ...overrides,
  };
}

describe('trackStore', () => {
  beforeEach(() => {
    useTrackStore.getState().clear();
  });

  it('adds a track', () => {
    useTrackStore.getState().upsertTrack(makeTrack('T-1'));
    expect(useTrackStore.getState().tracks['T-1']).toBeDefined();
    expect(useTrackStore.getState().tracks['T-1']!.position.lat).toBe(40.0);
  });

  it('updates an existing track', () => {
    useTrackStore.getState().upsertTrack(makeTrack('T-2', { position: { lat: 40.0, lon: -3.5, alt_m: 1500 } }));
    useTrackStore.getState().upsertTrack(makeTrack('T-2', { position: { lat: 41.0, lon: -3.5, alt_m: 2000 } }));
    expect(useTrackStore.getState().tracks['T-2']).toBeDefined();
    expect(useTrackStore.getState().tracks['T-2']!.position.lat).toBe(41.0);
    expect(useTrackStore.getState().tracks['T-2']!.position.alt_m).toBe(2000);
  });

  it('deletes a track', () => {
    useTrackStore.getState().upsertTrack(makeTrack('T-3'));
    useTrackStore.getState().removeTrack('T-3');
    expect(useTrackStore.getState().tracks['T-3']).toBeUndefined();
  });

  it('clears selectedTrackId when removing selected track', () => {
    useTrackStore.getState().upsertTrack(makeTrack('T-A'));
    useTrackStore.getState().selectTrack('T-A');
    useTrackStore.getState().removeTrack('T-A');
    expect(useTrackStore.getState().selectedTrackId).toBeNull();
  });

  it('clears all tracks', () => {
    useTrackStore.getState().upsertTrack(makeTrack('T-4'));
    useTrackStore.getState().upsertTrack(makeTrack('T-5'));
    useTrackStore.getState().clear();
    expect(Object.keys(useTrackStore.getState().tracks)).toHaveLength(0);
    expect(useTrackStore.getState().selectedTrackId).toBeNull();
  });

  it('upsertMany inserts multiple tracks', () => {
    useTrackStore.getState().upsertMany([makeTrack('T-6'), makeTrack('T-7'), makeTrack('T-8')]);
    expect(Object.keys(useTrackStore.getState().tracks)).toHaveLength(3);
  });
});
