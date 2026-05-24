import { type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface Props {
  side: 'left' | 'right';
  children: ReactNode;
  width?: string;
  ariaLabel?: string;
}

export function Sidebar({ side, children, width = 'w-[360px]', ariaLabel }: Props): JSX.Element {
  return (
    <aside
      role="complementary"
      aria-label={ariaLabel}
      className={cn(
        'flex flex-col gap-3 overflow-y-auto bg-bg-base p-3 border-border',
        width,
        side === 'left' ? 'border-r' : 'border-l',
      )}
    >
      {children}
    </aside>
  );
}
