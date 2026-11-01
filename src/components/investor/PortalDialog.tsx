'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * The portal's one dialog: a sheet from the bottom on phones, a centred card
 * on wider screens. Escape and the backdrop close it; the page behind does
 * not scroll. The footer (the dialog's buttons) stays in view while the body
 * scrolls, so the main action is never below the fold.
 */
export function PortalDialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    panel.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button type="button" aria-label="Close" tabIndex={-1} className="absolute inset-0 bg-site-night-deep/60 motion-safe:animate-[site-fade-in_.2s_ease-out]" onClick={onClose} />
      <div
        ref={panel}
        tabIndex={-1}
        style={{ outline: 'none' }}
        className={cn(
          'relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-site-3 sm:max-w-lg sm:rounded-3xl',
          className,
        )}
      >
        <header className="flex items-start gap-3 border-b border-site-line px-5 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg leading-snug font-semibold">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-sm text-site-muted">{description}</p>}
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="-mr-1 grid size-9 shrink-0 place-items-center rounded-full text-site-muted transition-colors hover:bg-site-soft hover:text-site-ink">
            <X className="size-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && <footer className="border-t border-site-line bg-site-ivory/60 px-5 pt-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:px-6">{footer}</footer>}
      </div>
    </div>
  );
}
