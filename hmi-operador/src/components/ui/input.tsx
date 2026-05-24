import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-10 w-full rounded-md border border-border bg-bg-base px-3 py-2 text-tactical-base ' +
          'text-text-primary placeholder:text-text-muted ' +
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan focus-visible:ring-offset-2 ' +
          'focus-visible:ring-offset-bg-base disabled:cursor-not-allowed disabled:opacity-50 font-mono',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
