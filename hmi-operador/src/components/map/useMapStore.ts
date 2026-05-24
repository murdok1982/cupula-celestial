import { create } from 'zustand';

export type MapMode = '3d' | '2d';

interface MapState {
  mode: MapMode;
  showGeofences: boolean;
  showInterceptors: boolean;
  showLeaderLines: boolean;
  slewToCueTrackId: string | null;
  setMode(m: MapMode): void;
  toggleGeofences(): void;
  toggleInterceptors(): void;
  toggleLeaderLines(): void;
  slewTo(trackId: string | null): void;
}

export const useMapStore = create<MapState>((set) => ({
  mode: '3d',
  showGeofences: true,
  showInterceptors: true,
  showLeaderLines: true,
  slewToCueTrackId: null,
  setMode(m): void {
    set({ mode: m });
  },
  toggleGeofences(): void {
    set((s) => ({ showGeofences: !s.showGeofences }));
  },
  toggleInterceptors(): void {
    set((s) => ({ showInterceptors: !s.showInterceptors }));
  },
  toggleLeaderLines(): void {
    set((s) => ({ showLeaderLines: !s.showLeaderLines }));
  },
  slewTo(trackId): void {
    set({ slewToCueTrackId: trackId });
  },
}));
