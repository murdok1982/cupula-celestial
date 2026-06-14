import { describe, it, expect, beforeEach } from 'vitest';
import { useAlertStore } from '@/store/alertStore';
import type { AlertMessage } from '@/types/api';

function makeAlert(id: string, severity: AlertMessage['severity'] = 'INFO'): AlertMessage {
  return {
    alert_id: id,
    severity,
    title: `Alerta ${id}`,
    message: `Mensaje de prueba para ${id}`,
    ts_ms: Date.now(),
    ack_required: false,
  };
}

describe('alertStore', () => {
  beforeEach(() => {
    useAlertStore.getState().clear();
  });

  it('pushes alerts up to max 50 FIFO', () => {
    const store = useAlertStore.getState();
    for (let i = 0; i < 60; i++) {
      store.push(makeAlert(`A-${i}`));
    }
    const alerts = useAlertStore.getState().alerts;
    expect(alerts.length).toBe(50);
    expect(alerts[0]!.alert_id).toBe('A-59');
  });

  it('acks an alert removing it', () => {
    useAlertStore.getState().push(makeAlert('ack-test'));
    expect(useAlertStore.getState().alerts.length).toBeGreaterThanOrEqual(1);
    useAlertStore.getState().ack('ack-test');
    const found = useAlertStore.getState().alerts.find(
      (a) => a.alert_id === 'ack-test',
    );
    expect(found).toBeUndefined();
  });

  it('clears all alerts', () => {
    useAlertStore.getState().push(makeAlert('clear-test'));
    useAlertStore.getState().clear();
    expect(useAlertStore.getState().alerts).toHaveLength(0);
  });

  it('pushes alerts with correct structure', () => {
    const alert = makeAlert('struct-test', 'CRITICAL');
    useAlertStore.getState().push(alert);
    const stored = useAlertStore.getState().alerts[0];
    expect(stored).toBeDefined();
    expect(stored!.alert_id).toBe('struct-test');
    expect(stored!.severity).toBe('CRITICAL');
    expect(stored!.ts_ms).toBeTypeOf('number');
    expect(stored!.ack_required).toBe(false);
  });
});
