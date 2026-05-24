import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VideoFeed } from '@/components/tactical/VideoFeed';
import { MOCK_INTERCEPTORS } from '@/mocks/mockData';

describe('VideoFeed', () => {
  const interceptor = MOCK_INTERCEPTORS[0];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('muestra estado vacio cuando no hay interceptor', () => {
    render(<VideoFeed interceptor={null} />);
    expect(screen.getByText(/Sin feed activo/i)).toBeInTheDocument();
  });

  it('renderiza canvas stub cuando no hay WebRTC', () => {
    render(<VideoFeed interceptor={interceptor ?? null} />);
    expect(screen.getByLabelText(/Video sintetico/i)).toBeInTheDocument();
  });

  it('muestra telemetria del interceptor en overlay', () => {
    if (!interceptor) throw new Error('mock');
    render(<VideoFeed interceptor={interceptor} />);
    expect(screen.getByText(new RegExp(`ALT ${interceptor.telemetry.altitude_m.toFixed(0)}m`))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`SPD ${interceptor.telemetry.speed_ms.toFixed(0)}m/s`))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`HDG ${interceptor.telemetry.heading_deg.toFixed(0)}deg`))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`BAT ${interceptor.telemetry.battery_pct.toFixed(0)}%`))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`LNK ${(interceptor.telemetry.link_quality * 100).toFixed(0)}%`))).toBeInTheDocument();
  });

  it('muestra badge de interceptor cuando hay interceptor', () => {
    if (!interceptor) throw new Error('mock');
    render(<VideoFeed interceptor={interceptor} />);
    expect(screen.getByText(interceptor.interceptor_id)).toBeInTheDocument();
  });

  it('muestra PiP button cuando la API esta disponible', () => {
    if (!interceptor) throw new Error('mock');
    // PiP may not be supported in test environment
    const pipSupported = Boolean(document.pictureInPictureEnabled);
    render(<VideoFeed interceptor={interceptor} />);
    const pipBtn = screen.queryByLabelText(/Picture-in-Picture/i);
    if (pipSupported) {
      expect(pipBtn).toBeInTheDocument();
    } else {
      expect(pipBtn).not.toBeInTheDocument();
    }
  });

  it('muestra fullscreen button', () => {
    if (!interceptor) throw new Error('mock');
    render(<VideoFeed interceptor={interceptor} />);
    const fsBtn = screen.getByLabelText(/Pantalla completa/i);
    expect(fsBtn).toBeInTheDocument();
  });

  it('muestra recording button', () => {
    if (!interceptor) throw new Error('mock');
    render(<VideoFeed interceptor={interceptor} />);
    const recBtn = screen.getByLabelText(/Iniciar grabacion/i);
    expect(recBtn).toBeInTheDocument();
  });

  it('muestra TGT-LOCK cuando hay interceptor', () => {
    if (!interceptor) throw new Error('mock');
    render(<VideoFeed interceptor={interceptor} />);
    expect(screen.getByText('TGT-LOCK')).toBeInTheDocument();
  });
});
