import { create } from 'zustand';
import type { WsConnectionState } from '@/api/ws';
import type { SystemStatus } from '@/types/api';

interface ConnectionState {
  wsState: WsConnectionState;
  latencyMs: number;
  systemStatus: SystemStatus;
  setWsState(s: WsConnectionState): void;
  setLatency(ms: number): void;
  setSystemStatus(s: SystemStatus): void;
}

const DEFAULT_STATUS: SystemStatus = {
  defcon: 4,
  ws_health: 'OK',
  latency_ms: 0,
  sensors_active: 0,
  sensors_total: 0,
  interceptors_ready: 0,
  interceptors_total: 0,
  audit_chain_ok: true,
};

export const useConnectionStore = create<ConnectionState>((set) => ({
  wsState: 'idle',
  latencyMs: 0,
  systemStatus: DEFAULT_STATUS,
  setWsState(s): void {
    set({ wsState: s });
  },
  setLatency(ms): void {
    set({ latencyMs: ms });
  },
  setSystemStatus(s): void {
    set({ systemStatus: s });
  },
}));
