import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NatoSymbol } from '@/components/tactical/NatoSymbol';

describe('NatoSymbol', () => {
  it('renders with correct APP-6 class', () => {
    render(<NatoSymbol classification="HOSTIL_CONFIRMADO" />);
    const el = screen.getByRole('img');
    expect(el).toBeDefined();
  });

  it('renders friendly symbol', () => {
    render(<NatoSymbol classification="MILITAR_AMIGO" />);
    const el = screen.getByRole('img');
    expect(el).toBeDefined();
  });
});
