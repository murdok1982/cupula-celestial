import { create } from 'zustand';
import type { AlertMessage } from '@/types/api';

interface AlertState {
  alerts: AlertMessage[];
  push(a: AlertMessage): void;
  ack(alertId: string): void;
  clear(): void;
}

const MAX_ALERTS = 50;

export const useAlertStore = create<AlertState>((set) => ({
  alerts: [],
  push(a): void {
    set((s) => ({ alerts: [a, ...s.alerts].slice(0, MAX_ALERTS) }));
  },
  ack(alertId): void {
    set((s) => ({ alerts: s.alerts.filter((x) => x.alert_id !== alertId) }));
  },
  clear(): void {
    set({ alerts: [] });
  },
}));
