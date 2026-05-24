import { type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-tactical-xs font-mono font-semibold uppercase tracking-wider',
  {
    variants: {
      variant: {
        default: 'border-border bg-bg-elevated text-text-primary',
        hostile: 'border-threat-hostile/60 bg-threat-hostile-bg text-threat-hostile',
        friend: 'border-threat-friend/60 bg-threat-friend-bg text-threat-friend',
        neutral: 'border-threat-neutral/60 bg-threat-neutral-bg text-threat-neutral',
        unknown: 'border-threat-unknown/60 bg-threat-unknown-bg text-threat-unknown',
        cyan: 'border-accent-cyan/60 bg-accent-cyan/10 text-accent-cyan',
        outline: 'border-border text-text-secondary',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps): JSX.Element {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
