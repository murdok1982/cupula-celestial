import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NatoSymbol } from '@/components/tactical/NatoSymbol';

describe('NatoSymbol', () => {
  it('renders with correct APP-6 class', () => {
    render(<NatoSymbol symbolId="SFAP-UAV" threat="HOSTILE" />);
    const el = screen.getByTestId('nato-symbol');
    expect(el).toBeDefined();
    expect(el.className).toContain('nato-symbol');
  });

  it('renders friendly symbol', () => {
    render(<NatoSymbol symbolId="SFAP-UAV" threat="FRIENDLY" />);
    const el = screen.getByTestId('nato-symbol');
    expect(el).toBeDefined();
  });
});
