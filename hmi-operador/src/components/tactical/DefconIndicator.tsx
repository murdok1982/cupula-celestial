import type { DefconLevel } from '@/types/api';
import { cn } from '@/lib/cn';

interface Props {
  level: DefconLevel;
}

const COLOR_MAP: Record<DefconLevel, string> = {
  1: 'bg-defcon-1 text-white border-defcon-1 animate-pulse-threat',
  2: 'bg-defcon-2 text-white border-defcon-2',
  3: 'bg-defcon-3 text-bg-base border-defcon-3',
  4: 'bg-defcon-4 text-bg-base border-defcon-4',
  5: 'bg-defcon-5 text-white border-defcon-5',
};

const LABEL_MAP: Record<DefconLevel, string> = {
  1: 'COMBATE',
  2: 'CRISIS',
  3: 'TENSION',
  4: 'ALERTA',
  5: 'NORMAL',
};

export function DefconIndicator({ level }: Props): JSX.Element {
  return (
    <div
      role="status"
      aria-label={`Nivel DEFCON ${level} ${LABEL_MAP[level]}`}
      data-testid="defcon-indicator"
      className={cn(
        'flex items-center gap-2 px-3 py-1 rounded-sm border-2 font-mono font-bold text-tactical-xs uppercase tracking-wider',
        COLOR_MAP[level],
      )}
    >
      <span>DEFCON {level}</span>
      <span className="opacity-90">{LABEL_MAP[level]}</span>
    </div>
  );
}
