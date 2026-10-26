'use client';

import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { en } from '../i18n/en';

/*
 * The questions Dhaka buyers ask before booking. Answers are general on
 * purpose: amounts and dates are the sale agreement's job, and fees are set by
 * the government, not by us.
 */
const FAQ = en.home.faq.items;

export function BuyerFaq() {
  const [open, setOpen] = useState(0);

  return (
    <div className="divide-y divide-site-line rounded-2xl border border-site-line bg-white">
      {FAQ.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q}>
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={`faq-${i}`}
              onClick={() => setOpen(isOpen ? -1 : i)}
              className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
            >
              <span className={cn('text-lg font-medium transition-colors', isOpen && 'text-site-primary')}>{item.q}</span>
              <span
                className={cn(
                  'grid size-8 shrink-0 place-items-center rounded-full transition-colors',
                  isOpen ? 'bg-site-primary text-white' : 'bg-site-soft text-site-ink',
                )}
              >
                {isOpen ? <Minus className="size-4" /> : <Plus className="size-4" />}
              </span>
            </button>
            {/* closed answers are hidden from screen readers too, not only collapsed */}
            <div
              id={`faq-${i}`}
              aria-hidden={!isOpen}
              inert={!isOpen}
              className={cn(
                'grid transition-[grid-template-rows] duration-300 ease-site-out',
                isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
              )}
            >
              <p className="overflow-hidden px-6 text-site-muted">
                <span className="block pb-5 leading-relaxed">{item.a}</span>
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
