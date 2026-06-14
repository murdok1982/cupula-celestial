import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';

vi.mock('@/components/layout/TopBar', () => ({
  TopBar: () => <div data-testid="topbar">TopBar</div>,
}));
vi.mock('@/components/layout/StatusBar', () => ({
  StatusBar: () => <div data-testid="statusbar">StatusBar</div>,
}));

describe('AppShell', () => {
  it('renders TopBar and StatusBar', () => {
    render(
      <BrowserRouter>
        <AppShell><div data-testid="content">Content</div></AppShell>
      </BrowserRouter>
    );
    expect(screen.getByTestId('topbar')).toBeDefined();
    expect(screen.getByTestId('statusbar')).toBeDefined();
  });
});
