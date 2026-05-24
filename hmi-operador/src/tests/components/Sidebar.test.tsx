import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';

describe('Sidebar', () => {
  it('renders left sidebar', () => {
    render(
      <BrowserRouter>
        <Sidebar side="left" />
      </BrowserRouter>
    );
    const sidebar = screen.getByTestId('sidebar-left');
    expect(sidebar).toBeDefined();
  });

  it('renders right sidebar', () => {
    render(
      <BrowserRouter>
        <Sidebar side="right" />
      </BrowserRouter>
    );
    const sidebar = screen.getByTestId('sidebar-right');
    expect(sidebar).toBeDefined();
  });
});
