import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecommendationCard } from '@/components/tactical/RecommendationCard';
import { MOCK_RECOMMENDATION } from '@/mocks/mockData';

describe('RecommendationCard', () => {
  it('muestra estado vacio cuando no hay recomendacion', () => {
    render(
      <RecommendationCard
        recommendation={null}
        canAuthorize={true}
        onAuthorize={vi.fn()}
        onReject={vi.fn()}
        onDefer={vi.fn()}
      />,
    );
    expect(screen.getByText(/Sin recomendaciones activas/i)).toBeInTheDocument();
  });

  it('muestra rationale y rationale completo del LLM', () => {
    render(
      <RecommendationCard
        recommendation={MOCK_RECOMMENDATION}
        canAuthorize={true}
        onAuthorize={vi.fn()}
        onReject={vi.fn()}
        onDefer={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Razonamiento del modelo')).toHaveTextContent(/Trayectoria balistica/i);
  });

  it('invoca onAuthorize al pulsar boton Autorizar', async () => {
    const onAuthorize = vi.fn();
    render(
      <RecommendationCard
        recommendation={MOCK_RECOMMENDATION}
        canAuthorize={true}
        onAuthorize={onAuthorize}
        onReject={vi.fn()}
        onDefer={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByTestId('btn-authorize'));
    expect(onAuthorize).toHaveBeenCalledOnce();
  });

  it('deshabilita Autorizar si canAuthorize es false', () => {
    render(
      <RecommendationCard
        recommendation={MOCK_RECOMMENDATION}
        canAuthorize={false}
        onAuthorize={vi.fn()}
        onReject={vi.fn()}
        onDefer={vi.fn()}
      />,
    );
    expect(screen.getByTestId('btn-authorize')).toBeDisabled();
    expect(screen.getByRole('note')).toHaveTextContent(/privilegios/i);
  });

  it('muestra todos los interceptores propuestos', () => {
    render(
      <RecommendationCard
        recommendation={MOCK_RECOMMENDATION}
        canAuthorize={true}
        onAuthorize={vi.fn()}
        onReject={vi.fn()}
        onDefer={vi.fn()}
      />,
    );
    for (const id of MOCK_RECOMMENDATION.interceptors_proposed) {
      expect(screen.getByText(id)).toBeInTheDocument();
    }
  });
});
