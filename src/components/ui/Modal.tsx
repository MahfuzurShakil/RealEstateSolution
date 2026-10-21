'use client';

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * The popup system (2026-10-21, POPUP-SYSTEM.md) — one shell for every dialog.
 *
 * Every popup has the same frame: a white header (icon chip, title, subtitle,
 * close), a body on the light canvas tint (so white inputs stand out), and a
 * white footer with the actions on the right.
 * What differs between popups is said by two things only:
 *
 *  - **tone** — the kind of popup. It colours the icon chip and nothing else
 *    (ConfirmDialog colours its main button to match). A whole header painted
 *    red, green or amber made popups of the same kind look unrelated the
 *    moment a page picked a different tone.
 *      default  forms, ordinary confirmations, information
 *      success  a result — use ResultDialog
 *      warning  consequential but recoverable (hold, retire, correct) and
 *               "this cannot be done" notices
 *      danger   destructive (delete, reject, undo)
 *
 *  - **size** — chosen by what is inside, never by the page:
 *      sm  440px   confirmation, notice, result
 *      md  640px   an ordinary form (default)
 *      lg  860px   a form with three- or four-column rows, or a table
 *      xl  1120px  viewers — a document, a map, a photo gallery
 *
 * Patterned on the Atlassian Design System modal and GitHub Primer dialog:
 * intent shown by the icon and the primary action, widths as a fixed scale.
 */
export type ModalTone = 'default' | 'danger' | 'success' | 'warning';
export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

export const TONE_CHIP: Record<ModalTone, string> = {
  default: 'bg-admin-50 text-admin-600 ring-admin-100',
  success: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
  warning: 'bg-amber-50 text-amber-600 ring-amber-100',
  danger: 'bg-red-50 text-red-600 ring-red-100',
};

const SIZES: Record<ModalSize, string> = {
  sm: 'max-w-[440px]',
  md: 'max-w-[640px]',
  lg: 'max-w-[860px]',
  xl: 'max-w-[1120px]',
};

/**
 * Overlay, focus trap-lite (Escape), scroll lock and the panel — shared by
 * Modal and ResultDialog so the two can never drift apart.
 */
export function DialogFrame({
  open,
  label,
  size,
  onClose,
  children,
}: {
  open: boolean;
  label: string;
  size: ModalSize;
  onClose: () => void;
  children: ReactNode;
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

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/45 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={cn(
          'relative z-10 flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5',
          SIZES[size],
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

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
  return (
    <DialogFrame open={open} label={title} size={size} onClose={onClose}>
      <div className="flex items-start gap-3 border-b border-hairline px-6 py-4">
        {Icon && (
          <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl ring-1', TONE_CHIP[tone])}>
            <Icon className="size-5" />
          </span>
        )}
        <div className="min-w-0 flex-1 self-center">
          <h2 className="text-base font-semibold leading-tight text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 truncate text-sm text-ink-muted">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-1 grid size-8 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-ink"
        >
          <X className="size-4" />
        </button>
      </div>

      {/*
        The body sits on the page canvas tint, so white inputs and white
        section cards stand out from it — a white body made every field blend
        into the background (client review 2026-10-21).
      */}
      <div className="flex-1 overflow-auto bg-canvas/55 px-6 py-6">{children}</div>

      {footer && (
        <div className="flex flex-wrap justify-end gap-2 border-t border-hairline bg-white px-6 py-3.5">
          {footer}
        </div>
      )}
    </DialogFrame>
  );
}
