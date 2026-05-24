import { Badge } from '@/components/ui/badge';
import { threatColorKey, threatLabel } from '@/lib/threat';
import type { ThreatClassification } from '@/types/tracks';

interface Props {
  classification: ThreatClassification;
  confidence?: number;
  pulse?: boolean;
}

export function ThreatBadge({ classification, confidence, pulse }: Props): JSX.Element {
  const variant = threatColorKey(classification) as
    | 'hostile'
    | 'friend'
    | 'neutral'
    | 'unknown';

  return (
    <Badge
      variant={variant}
      className={pulse && variant === 'hostile' ? 'animate-pulse-threat' : undefined}
      aria-label={`Clasificacion: ${threatLabel(classification)}${confidence !== undefined ? `, confianza ${Math.round(confidence * 100)}%` : ''}`}
      data-testid="threat-badge"
      data-classification={classification}
    >
      {threatLabel(classification)}
      {confidence !== undefined && (
        <span className="opacity-75">{Math.round(confidence * 100)}%</span>
      )}
    </Badge>
  );
}
