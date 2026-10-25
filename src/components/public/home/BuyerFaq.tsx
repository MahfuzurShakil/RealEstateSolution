'use client';

import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/*
 * The questions Dhaka buyers ask before booking. Answers are general on
 * purpose: amounts and dates are the sale agreement's job, and fees are set by
 * the government, not by us.
 */
const FAQ: { q: string; a: string }[] = [
  {
    q: 'How much do I pay to book?',
    a: 'You pay booking money to hold the flat, plot or share you chose, and receive a money receipt the same day. The booking is confirmed once the full booking money is in. The rest is paid as written in your sale agreement.',
  },
  {
    q: 'Which land papers should I see before booking?',
    a: 'The title deed, the khatian (CS, SA, RS and BS where they exist), the mutation (namjari) record, the latest land tax (khajna) receipt and the approved building or layout plan. We show all of them at the site office before you pay anything.',
  },
  {
    q: 'Can I pay in instalments?',
    a: 'Yes. Most buyers pay booking money, a down payment at the agreement, monthly instalments during construction and a final part at handover. You can also pay in full. The schedule is fixed in the sale agreement.',
  },
  {
    q: 'What costs are there besides the price?',
    a: 'Registration costs — stamp duty, registration fee and the taxes collected at the sub-registry office — are paid by the buyer at registration. Utility connections and parking, where they apply, are stated in the agreement.',
  },
  {
    q: 'When is the property registered in my name?',
    a: 'After the full price is paid, the deed is registered at the sub-registry office and mutation (namjari) follows. For a flat this includes your undivided share of the land.',
  },
  {
    q: 'I live abroad. Can I still buy?',
    a: 'Yes. We do a video walkthrough of the site and the papers, send documents by email, and you can pay by bank transfer. A family member can sign for you with a power of attorney.',
  },
];

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
            <div
              className={cn(
                'grid transition-[grid-template-rows] duration-300 ease-out',
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
