'use client';

import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/utils/cn';
import { formatBdt, formatTakaWords } from '@/lib/utils/format';

const CONTROL =
  'w-full rounded-xl border border-hairline bg-white px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-slate-400 focus:border-admin-400 focus:ring-2 focus:ring-admin-100 disabled:bg-slate-50';

/** Label above, control below (Design Reference A.9). */
export function Field({
  label,
  required,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 block text-sm font-medium text-ink">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-red-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-ink-muted">{hint}</span>
      ) : null}
    </label>
  );
}

export function TextInput({
  className,
  invalid,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input className={cn(CONTROL, invalid && 'border-red-300', className)} {...props} />;
}

/**
 * A money field that says what the number means while it is being typed.
 *
 * A bare `<input type="number">` shows an ungrouped run of digits, so
 * 45000000 and 450000000 are the same shape to the eye — and these fields hold
 * the price of land. Underneath it, the amount is echoed grouped and in the
 * units this market actually speaks in ("BDT 4,50,00,000 · 4.5 crore").
 *
 * The echo is a reading aid only: the value handled and stored is the plain
 * number typed, and money everywhere else is still displayed in full.
 */
export function MoneyInput({
  value,
  className,
  invalid,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  value: string;
  invalid?: boolean;
}) {
  const amount = value.trim() === '' ? null : Number(value);
  const valid = amount !== null && !Number.isNaN(amount);
  const words = valid ? formatTakaWords(amount) : '';

  return (
    <>
      <input
        type="number"
        min="0"
        inputMode="numeric"
        value={value}
        className={cn(CONTROL, invalid && 'border-red-300', className)}
        {...props}
      />
      {valid && amount !== 0 && (
        <span className="mt-1 block text-xs font-medium text-admin-700" aria-live="polite">
          {formatBdt(amount)}
          {words && ` · ${words}`}
        </span>
      )}
    </>
  );
}

export function SelectInput({
  className,
  invalid,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select className={cn(CONTROL, 'cursor-pointer', invalid && 'border-red-300', className)} {...props}>
      {children}
    </select>
  );
}

export function TextArea({
  className,
  invalid,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      rows={3}
      className={cn(CONTROL, 'resize-y', invalid && 'border-red-300', className)}
      {...props}
    />
  );
}

export function Checkbox({
  label,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={cn('flex cursor-pointer items-center gap-2.5 text-sm text-ink', className)}>
      <input
        type="checkbox"
        className="size-4 rounded border-hairline text-admin-500 accent-admin-500"
        {...props}
      />
      {label}
    </label>
  );
}
