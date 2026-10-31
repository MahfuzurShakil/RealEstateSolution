'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export interface SiteSelectOption<T extends string | number> {
  value: T;
  label: string;
}

/**
 * The portal's own drop-down. A native <select> opens the phone's system
 * picker — a full-width sheet in the OS colours that looks nothing like the
 * page — so lists the customer filters by open this menu instead.
 */
export function SiteSelect<T extends string | number>({
  value,
  options,
  onChange,
  label,
  size = 'md',
  align = 'left',
  up = false,
  className,
}: {
  value: T;
  options: SiteSelectOption<T>[];
  onChange: (v: T) => void;
  label: string;
  size?: 'sm' | 'md';
  align?: 'left' | 'right';
  /** open above the button, for a control at the bottom of a panel */
  up?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onDown = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  return (
    <div ref={wrap} className={cn('relative', className)}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{ outline: 'none' }}
        className={cn(
          'flex w-full items-center justify-between gap-2 border bg-white font-semibold transition-colors',
          size === 'md' ? 'h-12 rounded-xl px-4 text-[15px] shadow-site-1' : 'h-8 rounded-lg px-2.5 text-sm',
          open ? 'border-site-primary ring-4 ring-site-primary/15' : 'border-site-line hover:border-site-faint focus-visible:border-site-primary',
        )}
      >
        <span className="tabular truncate">{current?.label}</span>
        <ChevronDown className={cn('shrink-0 text-site-muted transition-transform', size === 'md' ? 'size-4.5' : 'size-3.5', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label={label}
          className={cn(
            'absolute z-30 max-h-72 min-w-full overflow-y-auto rounded-xl border border-site-line bg-white p-1 shadow-site-3',
            up ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {options.map((o) => {
            const on = o.value === value;
            return (
              <li key={String(o.value)} role="option" aria-selected={on}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left whitespace-nowrap transition-colors',
                    size === 'md' ? 'text-[15px]' : 'text-sm',
                    on ? 'bg-site-primary-soft/60 font-semibold text-site-primary-dark' : 'hover:bg-site-ivory',
                  )}
                >
                  <span className="tabular">{o.label}</span>
                  <Check className={cn('size-4 shrink-0 text-site-primary', !on && 'invisible')} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
