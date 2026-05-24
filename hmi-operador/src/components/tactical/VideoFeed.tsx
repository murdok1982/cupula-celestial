import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Camera, AlertCircle, Maximize, PictureInPicture2, Monitor, Circle } from 'lucide-react';
import { useWebRTC, type ConnectionQuality } from '@/hooks/useWebRTC';
import type { Interceptor } from '@/types/interceptors';
import { cn } from '@/lib/cn';

interface Props {
  interceptor: Interceptor | null;
  title?: string;
  ws?: WebSocket | null;
}

function qualityColor(quality: ConnectionQuality): string {
  switch (quality) {
    case 'green': return 'text-threat-neutral';
    case 'yellow': return 'text-accent-amber';
    case 'red': return 'text-threat-hostile';
  }
}

function QualityIndicator({ quality }: { quality: ConnectionQuality }): JSX.Element {
  return (
    <span className={cn('inline-block w-2 h-2 rounded-full', qualityColor(quality))} />
  );
}

export function VideoFeed({ interceptor, title = 'Feed EO/IR', ws }: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [webrtcAvailable, setWebrtcAvailable] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const {
    videoRef,
    connectionState,
    stats,
    isRecording,
    startRecording,
    stopRecording,
    pipEnabled,
    togglePiP,
    isPiPActive,
  } = useWebRTC({
    streamId: interceptor?.interceptor_id ?? 'stub',
    ws: ws ?? null,
  });

  useEffect(() => {
    try {
      if (typeof RTCPeerConnection === 'undefined') {
        setWebrtcAvailable(false);
      }
    } catch {
      setWebrtcAvailable(false);
    }
  }, []);

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setIsFullscreen(false);
      } else {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      }
    } catch {
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Animated stub when WebRTC is unavailable or not connected
  useEffect(() => {
    if (connectionState === 'connected' || !webrtcAvailable) return;
    if (!interceptor) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let t = 0;

    function draw(): void {
      t += 1;
      if (!ctx || !canvas) return;
      const W = canvas.width;
      const H = canvas.height;

      const grad = ctx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, W / 1.5);
      grad.addColorStop(0, '#1a2332');
      grad.addColorStop(1, '#0a0e14');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = 'rgba(0, 212, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, H * 0.4 + Math.sin(t * 0.02) * 5);
      ctx.lineTo(W, H * 0.4 + Math.sin(t * 0.02) * 5);
      ctx.stroke();

      ctx.strokeStyle = '#00d4ff';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(W / 2, 0);
      ctx.lineTo(W / 2, H);
      ctx.moveTo(0, H / 2);
      ctx.lineTo(W, H / 2);
      ctx.stroke();
      ctx.setLineDash([]);

      const tx = W / 2 + Math.sin(t * 0.04) * 30;
      const ty = H / 2 + Math.cos(t * 0.05) * 20;
      ctx.strokeStyle = '#ff3838';
      ctx.lineWidth = 2;
      ctx.strokeRect(tx - 25, ty - 25, 50, 50);

      const scanY = (t * 3) % H;
      ctx.fillStyle = 'rgba(0, 212, 255, 0.08)';
      ctx.fillRect(0, scanY, W, 2);

      raf = requestAnimationFrame(draw);
    }

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [interceptor, connectionState, webrtcAvailable]);

  const showStub = !interceptor || (!webrtcAvailable || connectionState !== 'connected');
  const isDegraded = connectionState !== 'connected' && connectionState !== 'new';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-accent-cyan" aria-hidden />
          {title}
        </CardTitle>
        {interceptor && (
          <Badge variant="cyan" className="self-start">{interceptor.interceptor_id}</Badge>
        )}
      </CardHeader>
      <CardContent>
        {interceptor ? (
          <div
            ref={containerRef}
            className="relative bg-bg-base border border-border rounded-md overflow-hidden"
          >
            {/* WebRTC video element (hidden when stub is shown) */}
            <video
              ref={videoRef}
              className={cn('w-full h-auto block', showStub && 'hidden')}
              autoPlay
              playsInline
              muted
              aria-label={`Video feed del interceptor ${interceptor.interceptor_id}`}
            />
            {/* Canvas stub (shown when WebRTC unavailable or not connected) */}
            <canvas
              ref={canvasRef}
              width={480}
              height={270}
              className={cn('w-full h-auto block', !showStub && 'hidden')}
              aria-label={`Video sintetico del interceptor ${interceptor.interceptor_id}`}
            />

            {/* Degraded mode badge */}
            {isDegraded && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10">
                <Badge variant="hostile" className="animate-blink-critical">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Sin señal - modo degradado
                </Badge>
              </div>
            )}

            {/* Telemetry overlay - always visible */}
            <div className="absolute top-2 left-2 text-tactical-xs font-mono text-accent-cyan space-y-0.5">
              <div>ALT {interceptor.telemetry.altitude_m.toFixed(0)}m</div>
              <div>SPD {interceptor.telemetry.speed_ms.toFixed(0)}m/s</div>
              <div>HDG {interceptor.telemetry.heading_deg.toFixed(0)}deg</div>
              {stats && (
                <div className={cn('flex items-center gap-1', qualityColor(stats.quality))}>
                  <QualityIndicator quality={stats.quality} />
                  {stats.quality === 'green' ? 'Excelente' : stats.quality === 'yellow' ? 'Regular' : 'Malo'}
                </div>
              )}
            </div>

            <div className="absolute top-2 right-2 text-tactical-xs font-mono text-accent-cyan space-y-0.5 text-right">
              <div>BAT {interceptor.telemetry.battery_pct.toFixed(0)}%</div>
              <div>LNK {(interceptor.telemetry.link_quality * 100).toFixed(0)}%</div>
              {stats && (
                <>
                  <div>RTT {stats.rtt}ms</div>
                  <div>JIT {stats.jitter}ms</div>
                </>
              )}
            </div>

            <div className="absolute bottom-2 left-2 text-tactical-xs font-mono text-threat-hostile font-bold">
              TGT-LOCK
            </div>

            {/* Control buttons */}
            <div className="absolute bottom-2 right-2 flex gap-1">
              {pipEnabled && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={togglePiP}
                  title={isPiPActive ? 'Salir de PiP' : 'Picture-in-Picture'}
                  aria-label={isPiPActive ? 'Salir de PiP' : 'Picture-in-Picture'}
                >
                  <PictureInPicture2 className="h-3 w-3" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
                aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
              >
                <Maximize className="h-3 w-3" />
              </Button>
              {isRecording ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-threat-hostile"
                  onClick={stopRecording}
                  title="Detener grabacion"
                  aria-label="Detener grabacion"
                >
                  <Monitor className="h-3 w-3" />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={startRecording}
                  title="Iniciar grabacion"
                  aria-label="Iniciar grabacion"
                >
                  <Circle className="h-3 w-3" />
                </Button>
              )}
            </div>

            {/* Recording indicator */}
            {isRecording && (
              <div className="absolute top-2 right-12 flex items-center gap-1 text-threat-hostile text-tactical-xs font-mono">
                <span className="w-2 h-2 rounded-full bg-threat-hostile animate-pulse" />
                REC
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-32 bg-bg-base border border-dashed border-border rounded-md text-text-muted text-tactical-sm font-mono">
            <AlertCircle className="h-4 w-4 mr-2" aria-hidden /> Sin feed activo
          </div>
        )}
      </CardContent>
    </Card>
  );
}
