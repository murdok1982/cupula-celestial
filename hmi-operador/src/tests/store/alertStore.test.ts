import { describe, it, expect } from 'vitest';
import { useAlertStore } from '@/store/alertStore';

function makeAlert(id: string) {
  return {
    alert_id: id,
    severity: 'INFO',
    message: `Alert ${id}`,
    timestamp: new Date().toISOString(),
  } as any;
}

describe('alertStore', () => {
  it('pushes alerts up to max 50 FIFO', () => {
    const store = useAlertStore.getState();
    for (let i = 0; i < 60; i++) {
      store.push(makeAlert(`A-${i}`));
    }
    const alerts = useAlertStore.getState().alerts;
    expect(alerts.length).toBe(50);
    expect(alerts[0].alert_id).toBe('A-59');
  });

  it('acks an alert removing it', () => {
    useAlertStore.getState().push(makeAlert('ack-test'));
    expect(useAlertStore.getState().alerts.length).toBeGreaterThanOrEqual(1);
    useAlertStore.getState().ack('ack-test');
    const found = useAlertStore.getState().alerts.find(
      (a) => a.alert_id === 'ack-test'
    );
    expect(found).toBeUndefined();
  });

  it('clears all alerts', () => {
    useAlertStore.getState().push(makeAlert('clear-test'));
    useAlertStore.getState().clear();
    expect(useAlertStore.getState().alerts).toHaveLength(0);
  });
});
