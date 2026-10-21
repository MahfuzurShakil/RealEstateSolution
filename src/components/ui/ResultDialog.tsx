'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from 'lucide-react';
import { Button } from './Button';
import { DialogFrame, TONE_CHIP, type ModalTone } from './Modal';
import { cn } from '@/lib/utils/cn';

const DEFAULT_ICON: Record<ModalTone, LucideIcon> = {
  default: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
};

/**
 * The popup that reports an outcome — "24 units created", "this supplier
 * cannot be deleted" (POPUP-SYSTEM.md).
 *
 * Always small and centred, with one button, whatever opened it. A result
 * shown inside the form that produced it inherited that form's width, which
 * is how a two-line success message ended up 1100px wide.
 */
export function ResultDialog({
  open,
  tone = 'success',
  icon,
  title,
  message,
  children,
  actionLabel = 'Done',
  onClose,
}: {
  open: boolean;
  tone?: ModalTone;
  icon?: LucideIcon;
  title: string;
  message?: ReactNode;
  /** details under the message — a short list, a note */
  children?: ReactNode;
  actionLabel?: string;
  onClose: () => void;
}) {
  const Icon = icon ?? DEFAULT_ICON[tone];
  return (
    <DialogFrame open={open} label={title} size="sm" onClose={onClose}>
      <div className="overflow-auto px-6 pb-2 pt-7 text-center">
        <span className={cn('mx-auto grid size-14 place-items-center rounded-full ring-8', TONE_CHIP[tone])}>
          <Icon className="size-7" />
        </span>
        <h2 className="mt-5 text-lg font-semibold text-ink">{title}</h2>
        {message && <div className="mt-1.5 text-sm text-ink-muted">{message}</div>}
        {children && <div className="mt-4 space-y-2 text-left">{children}</div>}
      </div>
      <div className="px-6 pb-6 pt-4">
        <Button className="w-full justify-center" onClick={onClose} viewSafe>
          {actionLabel}
        </Button>
      </div>
    </DialogFrame>
  );
}
