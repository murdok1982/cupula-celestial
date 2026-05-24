import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Helper estandar shadcn/ui para componer clases. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
