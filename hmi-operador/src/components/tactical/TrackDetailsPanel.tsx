import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ThreatBadge } from './ThreatBadge';
import { formatLatLon, formatAlt, formatRange, headingToOctant, approxMgrs } from '@/lib/coords';
import { formatTti, formatAge } from '@/lib/time';
import { iffLabel, threatHex } from '@/lib/threat';
import { cn } from '@/lib/cn';
import type { Track, GeoPosition, SensorContribution } from '@/types/tracks';

interface Props {
  track: Track | null;
}

function sensorBgColor(weight: number): string {
  if (weight > 0.5) return 'bg-accent-cyan/25';
  if (weight > 0.25) return 'bg-accent-cyan/15';
  return 'bg-bg-elevated';
}

function sensorTextColor(weight: number): string {
  if (weight > 0.5) return 'text-accent-cyan';
  if (weight > 0.25) return 'text-text-primary';
  return 'text-text-secondary';
}

function predictPosition(
  pos: GeoPosition,
  vx: number,
  vy: number,
  vz: number,
  seconds: number,
): { lat: number; lon: number; alt_m: number } {
  const latPerM = 1 / 111_320;
  const lonPerM = 1 / (111_320 * Math.cos((pos.lat * Math.PI) / 180));
  return {
    lat: pos.lat + vy * seconds * latPerM,
    lon: pos.lon + vx * seconds * lonPerM,
    alt_m: Math.max(0, pos.alt_m + vz * seconds),
  };
}

function TrajectoryPrediction({ track }: { track: Track }): JSX.Element {
  const predictions = useMemo(() => {
    const points: Array<{ sec: number; alt: number; speed: number }> = [];
    for (let s = 5; s <= 30; s += 5) {
      const p = predictPosition(
        track.position,
        track.velocity.vx_ms,
        track.velocity.vy_ms,
        track.velocity.vz_ms,
        s,
      );
      points.push({
        sec: s,
        alt: p.alt_m,
        speed: Math.sqrt(
          track.velocity.vx_ms ** 2 +
            track.velocity.vy_ms ** 2 +
            track.velocity.vz_ms ** 2,
        ),
      });
    }
    return points;
  }, [track]);

  const maxAlt = Math.max(...predictions.map((p) => p.alt), track.position.alt_m, 100);

  return (
    <div className="space-y-1">
      <p className="text-tactical-xs text-text-muted uppercase tracking-wider mb-1">
        Proyeccion 30s
      </p>
      <div className="relative h-24 bg-bg-base rounded border border-border p-2">
        <div className="flex items-end gap-px h-full">
          {predictions.map((p, i) => {
            const heightPct = p.alt > 0 ? (p.alt / maxAlt) * 100 : 0;
            return (
              <div
                key={p.sec}
                className="flex-1 flex flex-col items-center justify-end"
              >
                <div
                  className="w-full bg-accent-cyan/40 rounded-t"
                  style={{ height: `${Math.max(2, heightPct)}%` }}
                  title={`${p.sec}s: ${p.alt.toFixed(0)}m`}
                />
                {i % 2 === 0 && (
                  <span className="text-tactical-xs text-text-muted mt-0.5">{p.sec}s</span>
                )}
              </div>
            );
          })}
        </div>
        {/* Uncertainty band */}
        <div className="absolute inset-x-2 bottom-6 h-4 opacity-20">
          <div className="w-full h-full bg-accent-amber/30 rounded" />
        </div>
      </div>
    </div>
  );
}

function AltitudeChart({ track }: { track: Track }): JSX.Element {
  const now = Date.now();
  const samples = useMemo(() => {
    const points: Array<{ label: string; alt: number; speed: number }> = [];
    for (let i = 0; i < 30; i += 5) {
      const ts = now - (30 - i) * 1000;
      const altJitter = track.position.alt_m + Math.sin(i * 0.5) * 20;
      const speedJitter = track.speed_ms + Math.cos(i * 0.3) * 2;
      points.push({
        label: `${30 - i}s`,
        alt: altJitter,
        speed: speedJitter,
      });
    }
    return points;
  }, [track, now]);

  const maxAlt = Math.max(...samples.map((s) => s.alt), 100);

  return (
    <div className="space-y-1">
      <p className="text-tactical-xs text-text-muted uppercase tracking-wider mb-1">
        Altitud / Velocidad (ultimos 30s)
      </p>
      <div className="relative h-28 bg-bg-base rounded border border-border p-2">
        <div className="flex items-end gap-px h-full">
          {samples.map((s) => {
            const altPct = (s.alt / maxAlt) * 100;
            return (
              <div key={s.label} className="flex-1 flex flex-col items-center justify-end">
                <div
                  className="w-full bg-accent-cyan/30 rounded-t"
                  style={{ height: `${Math.max(2, altPct)}%` }}
                  title={`${s.label}: ${s.alt.toFixed(0)}m`}
                />
                <span className="text-tactical-xs text-text-muted mt-0.5">{s.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SensorMatrix({ sensors }: { sensors: SensorContribution[] }): JSX.Element {
  return (
    <div className="space-y-1">
      <p className="text-tactical-xs text-text-muted uppercase tracking-wider mb-1">
        Matriz de contribucion sensorial
      </p>
      <div className="grid grid-cols-1 gap-1" aria-label="Sensores que contribuyen al track">
        {sensors.map((s) => (
          <div
            key={s.sensor}
            className={cn(
              'flex items-center justify-between px-2 py-1.5 rounded text-tactical-xs font-mono border border-border',
              sensorBgColor(s.weight),
            )}
          >
            <span className={sensorTextColor(s.weight)}>{s.sensor}</span>
            <div className="flex items-center gap-2">
              <div className="w-16 h-1.5 bg-bg-base rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent-cyan rounded-full transition-all"
                  style={{ width: `${s.weight * 100}%` }}
                />
              </div>
              <span className={cn('tabular-nums w-8 text-right', sensorTextColor(s.weight))}>
                {(s.weight * 100).toFixed(0)}%
              </span>
              <span className="text-text-muted">
                {formatAge(s.last_update_ms)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GeneralTab({ track }: { track: Track }): JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-tactical-sm font-mono">
      <Field label="Posicion" value={formatLatLon(track.position)} />
      <Field label="MGRS" value={approxMgrs(track.position)} />
      <Field label="Altitud" value={formatAlt(track.position.alt_m)} />
      <Field label="Rango" value={formatRange(track.range_m)} />
      <Field label="Velocidad" value={`${track.speed_ms.toFixed(1)} m/s`} />
      <Field label="Rumbo" value={`${track.heading_deg.toFixed(0)}deg ${headingToOctant(track.heading_deg)}`} />
      <Field label="Modo" value={track.movement_mode} />
      <Field label="TTI" value={formatTti(track.tti_seconds)} />
      <Field label="Edad" value={formatAge(track.last_update_ms)} />
      <Field label="Confianza" value={`${(track.classification_confidence * 100).toFixed(0)}%`} />
      <AltitudeChart track={track} />
    </div>
  );
}

function SensorsTab({ track }: { track: Track }): JSX.Element {
  return <SensorMatrix sensors={track.sensors} />;
}

function HistoryTab({ track }: { track: Track }): JSX.Element {
  return (
    <div className="space-y-3">
      <AltitudeChart track={track} />
      <TrajectoryPrediction track={track} />
    </div>
  );
}

function RoeTab({ track }: { track: Track }): JSX.Element {
  return (
    <div className="text-tactical-sm font-mono space-y-2">
      <p className="text-text-muted">Estado IFF: {iffLabel(track.iff_status)}</p>
      <p className="text-text-muted">Modo de vuelo: {track.movement_mode}</p>
      <Separator />
      <div>
        <p className="text-tactical-xs text-text-muted uppercase tracking-wider mb-1">
          Clasificacion actual
        </p>
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: threatHex(track.classification) }}
          />
          <span>{track.classification}</span>
        </div>
      </div>
      <div>
        <p className="text-tactical-xs text-text-muted uppercase tracking-wider mb-1">
          Reglas aplicables
        </p>
        <ul className="space-y-1 text-text-secondary">
          <li className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-cyan" />
            ROE-7: Engagement automatico nivel AMBER
          </li>
          <li className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-cyan" />
            ROE-12: No-fly sobre geofences civiles
          </li>
          <li className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-cyan" />
            GEOFENCE-CIVIL: Distancia minima 800m
          </li>
        </ul>
      </div>
    </div>
  );
}

export function TrackDetailsPanel({ track }: Props): JSX.Element {
  if (!track) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Detalle de pista</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-text-muted text-tactical-sm font-mono">
            Seleccione una pista del listado o el mapa.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{track.track_id}</CardTitle>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <ThreatBadge classification={track.classification} confidence={track.classification_confidence} />
          <span className="text-tactical-xs font-mono text-text-secondary">{iffLabel(track.iff_status)}</span>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="general" data-testid="track-detail-tabs">
          <TabsList className="w-full">
            <TabsTrigger value="general" className="flex-1">General</TabsTrigger>
            <TabsTrigger value="sensors" className="flex-1">Sensores</TabsTrigger>
            <TabsTrigger value="history" className="flex-1">Historial</TabsTrigger>
            <TabsTrigger value="roe" className="flex-1">ROE</TabsTrigger>
          </TabsList>
          <TabsContent value="general">
            <GeneralTab track={track} />
          </TabsContent>
          <TabsContent value="sensors">
            <SensorsTab track={track} />
          </TabsContent>
          <TabsContent value="history">
            <HistoryTab track={track} />
          </TabsContent>
          <TabsContent value="roe">
            <RoeTab track={track} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <dt className="text-tactical-xs text-text-muted uppercase tracking-wider">{label}</dt>
      <dd className="text-text-primary">{value}</dd>
    </div>
  );
}
