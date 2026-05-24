/**
 * Preferencias UX del operador (no datos sensibles).
 */
import { create } from 'zustand';

export type DisplayMode = 'tactical' | 'night' | 'colorblind';

export type LayoutMode = '3col' | '2col' | 'map-only';

interface OperatorState {
  displayMode: DisplayMode;
  fontScale: number; // 1.0 = 100%
  audioAlertsEnabled: boolean;
  layoutMode: LayoutMode;
  emergencyMode: boolean;
  setDisplayMode(m: DisplayMode): void;
  setFontScale(scale: number): void;
  setAudioAlertsEnabled(v: boolean): void;
  setLayoutMode(m: LayoutMode): void;
  setEmergencyMode(v: boolean): void;
}

export const useOperatorStore = create<OperatorState>((set) => ({
  displayMode: 'tactical',
  fontScale: 1.0,
  audioAlertsEnabled: true,
  layoutMode: '3col',
  emergencyMode: false,
  setDisplayMode(m): void {
    set({ displayMode: m });
  },
  setFontScale(scale): void {
    set({ fontScale: Math.max(0.85, Math.min(1.5, scale)) });
  },
  setAudioAlertsEnabled(v): void {
    set({ audioAlertsEnabled: v });
  },
  setLayoutMode(m): void {
    set({ layoutMode: m });
  },
  setEmergencyMode(v): void {
    set({ emergencyMode: v });
  },
}));
