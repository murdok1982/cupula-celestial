import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TrackDetailsPanel } from '@/components/tactical/TrackDetailsPanel';
import { MOCK_TRACKS } from '@/mocks/mockData';

describe('TrackDetailsPanel', () => {
  const track = MOCK_TRACKS[0];

  it('muestra estado vacio cuando no hay track', () => {
    render(<TrackDetailsPanel track={null} />);
    expect(screen.getByText(/Seleccione una pista/i)).toBeInTheDocument();
  });

  it('renderiza datos del track cuando hay track', () => {
    if (!track) throw new Error('mock');
    render(<TrackDetailsPanel track={track} />);
    expect(screen.getByText(track.track_id)).toBeInTheDocument();
    expect(screen.getByText(/HOSTIL/)).toBeInTheDocument();
  });

  it('muestra informacion de posicion', () => {
    if (!track) throw new Error('mock');
    render(<TrackDetailsPanel track={track} />);
    expect(screen.getByText(/N/)).toBeInTheDocument();
    expect(screen.getByText(/W/)).toBeInTheDocument();
  });

  it('muestra el threat badge con clasificacion', () => {
    if (!track) throw new Error('mock');
    render(<TrackDetailsPanel track={track} />);
    expect(screen.getByTestId('threat-badge')).toBeInTheDocument();
  });

  it('tiene tabs de navegacion', () => {
    if (!track) throw new Error('mock');
    render(<TrackDetailsPanel track={track} />);
    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByText('Sensores')).toBeInTheDocument();
    expect(screen.getByText('Historial')).toBeInTheDocument();
    expect(screen.getByText('ROE')).toBeInTheDocument();
  });

  it('cambia de pestania al hacer click', async () => {
    if (!track) throw new Error('mock');
    render(<TrackDetailsPanel track={track} />);
    const sensorsTab = screen.getByText('Sensores');
    await userEvent.click(sensorsTab);
    expect(screen.getByText('Matriz de contribucion sensorial')).toBeInTheDocument();
  });

  it('la pestania ROE muestra informacion de reglas', async () => {
    if (!track) throw new Error('mock');
    render(<TrackDetailsPanel track={track} />);
    const roeTab = screen.getByText('ROE');
    await userEvent.click(roeTab);
    expect(screen.getByText(/ROE-7/)).toBeInTheDocument();
  });

  it('muestra sensor contributions', async () => {
    if (!track) throw new Error('mock');
    render(<TrackDetailsPanel track={track} />);
    const sensorsTab = screen.getByText('Sensores');
    await userEvent.click(sensorsTab);
    for (const s of track.sensors) {
      expect(screen.getByText(s.sensor)).toBeInTheDocument();
    }
  });

  it('la pestania Historial muestra proyeccion', async () => {
    if (!track) throw new Error('mock');
    render(<TrackDetailsPanel track={track} />);
    const historyTab = screen.getByText('Historial');
    await userEvent.click(historyTab);
    expect(screen.getByText(/Proyeccion 30s/)).toBeInTheDocument();
  });
});
