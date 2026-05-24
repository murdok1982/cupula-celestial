import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TrackRow } from '@/components/tactical/TrackRow';
import { MOCK_TRACKS } from '@/mocks/mockData';

describe('TrackRow', () => {
  const track = MOCK_TRACKS[0];

  it('renderiza ID, clasificacion y TTI de la pista hostil', () => {
    if (!track) throw new Error('mock');
    render(<TrackRow track={track} selected={false} onSelect={vi.fn()} />);
    expect(screen.getByTestId(`track-row-${track.track_id}`)).toBeInTheDocument();
    expect(screen.getByText(track.track_id)).toBeInTheDocument();
    expect(screen.getByText(/HOSTIL/)).toBeInTheDocument();
    expect(screen.getByText(/TTI/)).toBeInTheDocument();
  });

  it('llama onSelect con el track_id al hacer click', async () => {
    if (!track) throw new Error('mock');
    const onSelect = vi.fn();
    render(<TrackRow track={track} selected={false} onSelect={onSelect} />);
    await userEvent.click(screen.getByTestId(`track-row-${track.track_id}`));
    expect(onSelect).toHaveBeenCalledWith(track.track_id);
  });

  it('marca aria-selected cuando esta seleccionada', () => {
    if (!track) throw new Error('mock');
    render(<TrackRow track={track} selected={true} onSelect={vi.fn()} />);
    expect(screen.getByTestId(`track-row-${track.track_id}`)).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('muestra etiqueta REC si hasRecommendation', () => {
    if (!track) throw new Error('mock');
    render(<TrackRow track={track} selected={false} onSelect={vi.fn()} hasRecommendation />);
    expect(screen.getByLabelText(/Recomendacion LLM disponible/i)).toBeInTheDocument();
  });
});
