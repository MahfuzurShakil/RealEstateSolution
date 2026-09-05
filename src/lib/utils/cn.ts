import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Joins class names **and resolves Tailwind conflicts**, last one winning.
 *
 * It used to be `clsx` alone, which concatenates: a component whose base style
 * said `w-full` and a caller passing `w-auto` produced `class="w-full w-auto"`,
 * and the browser then picked whichever rule came later in the stylesheet — not
 * whichever the caller asked for. Every `w-auto` override on a filter dropdown
 * in the app was silently dead, which is why those selects stretched across the
 * whole row.
 *
 * `twMerge` makes the caller's class win, which is what every call site already
 * assumed.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
