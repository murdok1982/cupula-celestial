import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThreatBadge } from '@/components/tactical/ThreatBadge';

describe('ThreatBadge', () => {
  it('muestra etiqueta HOSTIL para HOSTIL_CONFIRMADO', () => {
    render(<ThreatBadge classification="HOSTIL_CONFIRMADO" />);
    const badge = screen.getByTestId('threat-badge');
    expect(badge).toHaveTextContent('HOSTIL');
    expect(badge).toHaveAttribute('data-classification', 'HOSTIL_CONFIRMADO');
  });

  it('muestra confianza cuando se pasa', () => {
    render(<ThreatBadge classification="AMENAZA_PROBABLE" confidence={0.87} />);
    expect(screen.getByTestId('threat-badge')).toHaveTextContent('87%');
  });

  it('mapea MILITAR_AMIGO a AMIGO', () => {
    render(<ThreatBadge classification="MILITAR_AMIGO" />);
    expect(screen.getByTestId('threat-badge')).toHaveTextContent('AMIGO');
  });

  it('mapea CIVIL a CIVIL', () => {
    render(<ThreatBadge classification="CIVIL" />);
    expect(screen.getByTestId('threat-badge')).toHaveTextContent('CIVIL');
  });

  it('expone aria-label legible', () => {
    render(<ThreatBadge classification="HOSTIL_CONFIRMADO" confidence={0.95} />);
    expect(screen.getByLabelText(/HOSTIL/)).toBeInTheDocument();
    expect(screen.getByLabelText(/95/)).toBeInTheDocument();
  });
});
