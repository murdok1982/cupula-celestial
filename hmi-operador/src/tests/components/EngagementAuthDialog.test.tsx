import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EngagementAuthDialog } from '@/components/tactical/EngagementAuthDialog';
import { MOCK_RECOMMENDATION } from '@/mocks/mockData';

describe('EngagementAuthDialog', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('no renderiza nada si decision es null', () => {
    const { container } = render(
      <EngagementAuthDialog
        open={true}
        recommendation={MOCK_RECOMMENDATION}
        decision={null}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('muestra titulo AUTORIZAR ENGAGEMENT con decision AUTHORIZE', () => {
    render(
      <EngagementAuthDialog
        open={true}
        recommendation={MOCK_RECOMMENDATION}
        decision="AUTHORIZE"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getAllByText(/AUTORIZAR ENGAGEMENT/i).length).toBeGreaterThan(0);
  });

  it('muestra countdown visible', () => {
    render(
      <EngagementAuthDialog
        open={true}
        recommendation={MOCK_RECOMMENDATION}
        decision="AUTHORIZE"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByTestId('auth-countdown')).toBeInTheDocument();
  });

  it('cancela al pulsar Cancelar', async () => {
    const onClose = vi.fn();
    render(
      <EngagementAuthDialog
        open={true}
        recommendation={MOCK_RECOMMENDATION}
        decision="REJECT"
        onClose={onClose}
        onConfirm={vi.fn()}
      />,
    );
    const cancelBtn = screen.getAllByRole('button', { name: /Cancelar/i })[0];
    expect(cancelBtn).toBeDefined();
    if (cancelBtn) {
      await userEvent.click(cancelBtn);
      expect(onClose).toHaveBeenCalled();
    }
  });

  it('rechaza PIN con menos de 6 digitos', async () => {
    render(
      <EngagementAuthDialog
        open={true}
        recommendation={MOCK_RECOMMENDATION}
        decision="AUTHORIZE"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    await userEvent.type(screen.getByTestId('auth-pin-input'), '123');
    await userEvent.click(screen.getByTestId('auth-pin-submit'));
    expect(await screen.findByText(/6 digitos/i)).toBeInTheDocument();
  });
});
