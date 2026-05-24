import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AlertBanner } from '@/components/tactical/AlertBanner';

describe('AlertBanner', () => {
  it('renders critical alert with red styling', () => {
    render(
      <AlertBanner
        alertId="A-1"
        severity="CRITICAL"
        message="Threat detected"
        timestamp="2026-01-15T12:00:00Z"
      />
    );
    expect(screen.getByText('CRITICAL')).toBeDefined();
    expect(screen.getByText('Threat detected')).toBeDefined();
  });

  it('renders info alert with blue styling', () => {
    render(
      <AlertBanner
        alertId="A-2"
        severity="INFO"
        message="System OK"
        timestamp="2026-01-15T12:00:00Z"
      />
    );
    expect(screen.getByText('INFO')).toBeDefined();
    expect(screen.getByText('System OK')).toBeDefined();
  });
});
