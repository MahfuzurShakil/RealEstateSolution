'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { formatDay, type HoldingView } from '@/lib/domain/investor-portal';
import { cn } from '@/lib/utils/cn';
import { Money } from './ui';

function Row({ v }: { v: HoldingView }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- mock stock photo */}
      <img src={v.project.image} alt="" className="size-10 shrink-0 rounded-xl object-cover" />
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate font-semibold">{v.project.name}</span>
        <span className="block truncate text-xs text-site-muted">
          <span className="tabular">{v.holding.code}</span>
          {' · '}
          {v.due_now > 0 ? (
            <span className="font-semibold text-site-danger">
              <Money amount={v.due_now} /> overdue
            </span>
          ) : v.next ? (
            <>
              next <Money amount={v.next.remaining} /> on {formatDay(v.next.due_date)}
            </>
          ) : (
            'fully paid'
          )}
        </span>
      </span>
    </>
  );
}

/**
 * Which investment to pay. A drop-down, so ten projects take no more room
 * than one; with a single investment it is shown, already chosen, with no menu.
 */
export function InvestmentSelect({ options, value, onChange }: { options: HoldingView[]; value: HoldingView; onChange: (v: HoldingView) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onClick = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  if (options.length < 2) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-site-line bg-site-ivory p-3">
        <Row v={value} />
      </div>
    );
  }

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{ outline: 'none' }}
        className={cn(
          'flex w-full items-center gap-3 rounded-2xl border bg-white p-3 transition-colors',
          open ? 'border-site-primary ring-4 ring-site-primary/15' : 'border-site-line hover:border-site-faint focus-visible:border-site-primary focus-visible:ring-4 focus-visible:ring-site-primary/15',
        )}
      >
        <Row v={value} />
        <ChevronDown className={cn('size-5 shrink-0 text-site-muted transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <ul role="listbox" aria-label="Investment" className="absolute inset-x-0 top-full z-20 mt-2 max-h-80 overflow-y-auto rounded-2xl border border-site-line bg-white p-1.5 shadow-site-3">
          {options.map((v) => {
            const on = v.holding.code === value.holding.code;
            return (
              <li key={v.holding.code} role="option" aria-selected={on}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(v);
                    setOpen(false);
                  }}
                  className={cn('flex w-full items-center gap-3 rounded-xl p-2.5 transition-colors', on ? 'bg-site-primary-soft/60' : 'hover:bg-site-ivory')}
                >
                  <Row v={v} />
                  <Check className={cn('size-5 shrink-0 text-site-primary', !on && 'invisible')} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
