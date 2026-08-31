'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, type LucideIcon } from 'lucide-react';
import { Button } from './Button';
import { Modal, type ModalTone } from './Modal';

/**
 * Confirmation dialog. `children` can carry extra fields (a date, a remark)
 * for steps that must capture information along with the confirmation.
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
}) {
  return (
    <Modal
      open={open}
      title={title}
      subtitle={subtitle}
      icon={icon}
      tone={tone}
      size="sm"
      onClose={onCancel}
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={busy || disabled}
          >
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </>
      }
    >
      {message && <p className="text-sm text-ink-muted">{message}</p>}
      {children && <div className={message ? 'mt-4' : ''}>{children}</div>}
    </Modal>
  );
}
