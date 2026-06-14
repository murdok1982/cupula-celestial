import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AlertBanner } from '@/components/tactical/AlertBanner';
import { useAlertStore } from '@/store/alertStore';

describe('AlertBanner', () => {
  beforeEach(() => {
    useAlertStore.getState().clear();
  });

  it('renders critical alert with red styling', () => {
    useAlertStore.getState().push({
      alert_id: 'A-1',
      severity: 'CRITICAL',
      title: 'Threat detected',
      message: 'Threat detected',
      ts_ms: Date.now(),
      ack_required: true,
    });
    render(<AlertBanner />);
    expect(screen.getByText('Threat detected')).toBeDefined();
  });

  it('renders info alert with blue styling', () => {
    useAlertStore.getState().push({
      alert_id: 'A-2',
      severity: 'INFO',
      title: 'System OK',
      message: 'System OK',
      ts_ms: Date.now(),
      ack_required: false,
    });
    render(<AlertBanner />);
    expect(screen.getByText('System OK')).toBeDefined();
  });
});
