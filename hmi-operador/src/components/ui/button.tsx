import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium ' +
    'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan ' +
    'focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base ' +
    'disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-bg-elevated text-text-primary border border-border hover:bg-bg-hover',
        tactical:
          'bg-accent-cyan/15 text-accent-cyan border border-accent-cyan/40 hover:bg-accent-cyan/25',
        destructive:
          'bg-threat-hostile text-white border border-threat-hostile/80 hover:bg-threat-hostile/90 ' +
          'focus-visible:ring-threat-hostile',
        authorize:
          'bg-threat-neutral text-bg-base border border-threat-neutral/80 hover:bg-threat-neutral/90 ' +
          'font-semibold uppercase tracking-wider',
        reject:
          'bg-threat-hostile text-white border border-threat-hostile/80 hover:bg-threat-hostile/90 ' +
          'font-semibold uppercase tracking-wider',
        ghost: 'hover:bg-bg-elevated text-text-secondary hover:text-text-primary',
        outline: 'border border-border bg-transparent hover:bg-bg-elevated text-text-primary',
        link: 'text-accent-cyan underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2 text-tactical-sm',
        sm: 'h-8 px-3 text-tactical-xs',
        lg: 'h-12 px-6 text-tactical-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
