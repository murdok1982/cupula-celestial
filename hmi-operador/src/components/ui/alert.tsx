import { forwardRef, type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

const alertVariants = cva(
  'relative w-full rounded-md border px-4 py-3 text-tactical-sm font-mono [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-3 [&>svg+div]:translate-y-[-3px] [&:has(svg)]:pl-11',
  {
    variants: {
      variant: {
        default: 'border-border bg-bg-elevated text-text-primary',
        info: 'border-accent-cyan/40 bg-accent-cyan/10 text-accent-cyan',
        warning: 'border-threat-unknown/40 bg-threat-unknown-bg text-threat-unknown',
        critical: 'border-threat-hostile/40 bg-threat-hostile-bg text-threat-hostile',
        success: 'border-threat-neutral/40 bg-threat-neutral-bg text-threat-neutral',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface AlertProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {}

export const Alert = forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant, ...props }, ref) => (
    <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
  ),
);
Alert.displayName = 'Alert';

export const AlertTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5
      ref={ref}
      className={cn('mb-1 font-semibold uppercase tracking-wider', className)}
      {...props}
    />
  ),
);
AlertTitle.displayName = 'AlertTitle';

export const AlertDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('text-tactical-sm opacity-95', className)} {...props} />
  ),
);
AlertDescription.displayName = 'AlertDescription';
