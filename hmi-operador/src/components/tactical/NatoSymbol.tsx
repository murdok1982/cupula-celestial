import { natoSvg } from '@/lib/nato-symbology';
import { threatLabel } from '@/lib/threat';
import type { ThreatClassification } from '@/types/tracks';

interface Props {
  classification: ThreatClassification;
  size?: number;
  className?: string;
}

export function NatoSymbol({ classification, size = 24, className }: Props): JSX.Element {
  return (
    <span
      className={className}
      role="img"
      aria-label={`Simbolo NATO APP-6 para ${threatLabel(classification)}`}
      style={{ display: 'inline-flex', width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: natoSvg(classification, size) }}
    />
  );
}
