'use client';

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export type ModalTone = 'default' | 'danger' | 'success' | 'warning';
export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

/**
 * One dialog shell for the whole app, so every popup looks the same:
 * a tinted, coloured header strip (tone) with an icon + title + subtitle,
 * a light body on the page canvas colour, and a footer action bar.
 */
const TONES: Record<ModalTone, { header: string; icon: string; title: string }> = {
  default: {
    header: 'bg-gradient-to-r from-admin-600 to-admin-500',
    icon: 'bg-white/20 text-white',
    title: 'text-white',
  },
  danger: {
    header: 'bg-gradient-to-r from-red-600 to-red-500',
    icon: 'bg-white/20 text-white',
    title: 'text-white',
  },
  success: {
    header: 'bg-gradient-to-r from-emerald-600 to-emerald-500',
    icon: 'bg-white/20 text-white',
    title: 'text-white',
  },
  warning: {
    header: 'bg-gradient-to-r from-amber-500 to-amber-400',
    icon: 'bg-white/25 text-white',
    title: 'text-white',
  },
};

const SIZES: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-6xl',
};

export function Modal({
  open,
  title,
  subtitle,
  icon: Icon,
  tone = 'default',
  size = 'md',
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  tone?: ModalTone;
  size?: ModalSize;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    // stop the page behind the dialog from scrolling
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  // Rendered through a portal: dialogs are often opened from inside a form, and
  // nesting one form (or a submit button) inside another is invalid HTML.
  // `open` is always false during SSR, so there is nothing to hydrate.
  if (!open || typeof document === 'undefined') return null;

  const palette = TONES[tone];

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative z-10 flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5',
          SIZES[size],
        )}
      >
        <div className={cn('flex items-start gap-3 px-5 py-4', palette.header)}>
          {Icon && (
            <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', palette.icon)}>
              <Icon className="size-5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 className={cn('text-base font-semibold leading-tight', palette.title)}>{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-white/80">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-white/80 transition-colors hover:bg-white/20 hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-canvas/60 p-5">{children}</div>

        {footer && (
          <div className="flex justify-end gap-2 border-t border-hairline bg-white px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
