import { cn } from '@/lib/cn';
import { ThreatBadge } from './ThreatBadge';
import { NatoSymbol } from './NatoSymbol';
import { formatTti } from '@/lib/time';
import { formatRange, headingToOctant } from '@/lib/coords';
import { ttiSeverity } from '@/lib/tti';
import type { Track } from '@/types/tracks';

interface Props {
  track: Track;
  selected: boolean;
  onSelect(trackId: string): void;
  hasRecommendation?: boolean;
}

export function TrackRow({ track, selected, onSelect, hasRecommendation }: Props): JSX.Element {
  const sev = ttiSeverity(track.tti_seconds);
  const sevClass = {
    critical: 'border-l-threat-hostile bg-threat-hostile-bg/40',
    high: 'border-l-accent-amber bg-threat-unknown-bg/30',
    medium: 'border-l-accent-cyan/60 bg-bg-elevated',
    low: 'border-l-border bg-bg-panel',
  }[sev];

  return (
    <button
      type="button"
      onClick={() => onSelect(track.track_id)}
      data-testid={`track-row-${track.track_id}`}
      aria-selected={selected}
      aria-label={`Pista ${track.track_id}, ${track.classification}, TTI ${formatTti(track.tti_seconds)}, rango ${formatRange(track.range_m)}`}
      className={cn(
        'w-full text-left border-l-4 transition-colors',
        'px-3 py-2 grid grid-cols-[auto_1fr_auto] gap-3 items-center font-mono text-tactical-sm',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan',
        sevClass,
        selected && 'ring-1 ring-accent-cyan bg-accent-cyan/10',
        'hover:bg-bg-hover',
      )}
    >
      <NatoSymbol classification={track.classification} size={22} />
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-text-primary font-bold">{track.track_id}</span>
          {hasRecommendation && (
            <span
              className="text-tactical-xs text-accent-cyan font-bold animate-blink-critical"
              aria-label="Recomendacion LLM disponible"
            >
              REC
            </span>
          )}
        </div>
        <div className="flex gap-2 text-tactical-xs text-text-secondary truncate">
          <span>{formatRange(track.range_m)}</span>
          <span>{headingToOctant(track.heading_deg)} {track.heading_deg.toFixed(0)}deg</span>
          <span>{track.speed_ms.toFixed(0)} m/s</span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <ThreatBadge classification={track.classification} pulse={sev === 'critical'} />
        <span
          className={cn(
            'text-tactical-xs font-bold tabular-nums',
            sev === 'critical' && 'text-threat-hostile animate-blink-critical',
            sev === 'high' && 'text-accent-amber',
            sev === 'medium' && 'text-accent-cyan',
            sev === 'low' && 'text-text-muted',
          )}
        >
          TTI {formatTti(track.tti_seconds)}
        </span>
      </div>
    </button>
  );
}
