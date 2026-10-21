'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, type LucideIcon } from 'lucide-react';
import { Button } from './Button';
import { Modal, type ModalSize, type ModalTone } from './Modal';

/**
 * Confirmation dialog. `children` can carry extra fields (a date, a remark)
 * for steps that must capture information along with the confirmation.
 *
 * POPUP-SYSTEM.md: `tone` defaults to danger because most confirmations are
 * deletes — anything that is not destructive passes `default` or `warning`.
 * The main button takes the tone's colour. Size follows the content: a plain
 * question is small; one that collects fields is a form, and gets form width
 * — a registration with six fields in a 440px box was a tall, narrow scroll.
 */
export function ConfirmDialog({
  open,
  title,
  subtitle,
  message,
  tone = 'danger',
  icon = AlertTriangle,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  busy,
  disabled,
  onConfirm,
  onCancel,
  children,
  size,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  message?: string;
  tone?: ModalTone;
  icon?: LucideIcon;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  disabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
  /** overrides the content-based size; only for dialogs that collect a lot */
  size?: ModalSize;
}) {
  /*
   * Success is for results (ResultDialog). A confirmation of a good thing —
   * approve, accept, mark delivered — is still a confirmation, so it looks
   * like every other one.
   */
  const shown: ModalTone = tone === 'success' ? 'default' : tone;
  return (
    <Modal
      open={open}
      title={title}
      subtitle={subtitle}
      icon={icon}
      tone={shown}
      size={size ?? (children ? 'md' : 'sm')}
      onClose={onCancel}
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={busy} viewSafe>
            {cancelLabel}
          </Button>
          {/* solid in the tone's colour — the one other place tone shows */}
          <Button
            className={
              shown === 'danger'
                ? 'bg-red-600 hover:bg-red-700'
                : shown === 'warning'
                  ? 'bg-amber-500 hover:bg-amber-600'
                  : undefined
            }
            onClick={onConfirm}
            disabled={busy || disabled}
          >
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </>
      }
    >
      {message && <p className="text-sm leading-relaxed text-ink-muted">{message}</p>}
      {children && <div className={message ? 'mt-4' : ''}>{children}</div>}
    </Modal>
  );
}
