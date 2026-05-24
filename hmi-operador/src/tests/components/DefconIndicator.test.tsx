import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DefconIndicator } from '@/components/tactical/DefconIndicator';

describe('DefconIndicator', () => {
  it('renders DEFCON 1 as red', () => {
    render(<DefconIndicator level={1} />);
    const el = screen.getByTestId('defcon-indicator');
    expect(el).toBeDefined();
    expect(el.textContent).toContain('1');
  });

  it('renders DEFCON 5 as green', () => {
    render(<DefconIndicator level={5} />);
    const el = screen.getByTestId('defcon-indicator');
    expect(el).toBeDefined();
    expect(el.textContent).toContain('5');
  });

  it('renders all DEFCON levels 1-5', () => {
    for (let level = 1; level <= 5; level++) {
      render(<DefconIndicator level={level as 1|2|3|4|5} />);
    }
  });
});
