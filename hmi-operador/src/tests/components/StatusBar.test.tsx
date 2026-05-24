import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBar } from '@/components/layout/StatusBar';

describe('StatusBar', () => {
  it('renders without crashing', () => {
    render(<StatusBar />);
    expect(screen.getByTestId('statusbar')).toBeDefined();
  });
});
