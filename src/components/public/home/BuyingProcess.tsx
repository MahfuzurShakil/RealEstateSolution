'use client';

import { FileSearch, FileSignature, HandCoins, KeyRound, Landmark, MapPinned, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { en } from '../i18n/en';
import { useInView } from '../motion';

/*
 * How a flat, plot or share is actually bought from a developer in Bangladesh,
 * in the order it happens (copy in i18n/en.ts). On wide screens the six steps
 * sit on one line that draws itself left to right as it scrolls into view
 * (master plan §6.2); on phones it is a vertical timeline.
 */
const ICONS: LucideIcon[] = [MapPinned, FileSearch, HandCoins, FileSignature, KeyRound, Landmark];

export function BuyingProcess() {
  const [ref, seen] = useInView<HTMLOListElement>();
  const steps = en.home.steps.items;

  return (
    <ol ref={ref} className="relative mt-14 grid gap-8 lg:grid-cols-6 lg:gap-5">
      {/* the connecting line: vertical on phones, horizontal from lg */}
      <span aria-hidden className="absolute top-2 bottom-2 left-7 w-px bg-site-line lg:top-7 lg:right-[8%] lg:bottom-auto lg:left-[8%] lg:h-px lg:w-auto" />
      <span
        aria-hidden
        className={cn(
          'absolute top-2 left-7 w-px origin-top bg-site-primary transition-transform duration-[1600ms] ease-site-out lg:top-7 lg:right-[8%] lg:left-[8%] lg:h-px lg:w-auto lg:origin-left',
          'bottom-2 lg:bottom-auto',
          seen ? 'scale-y-100 lg:scale-x-100' : 'scale-y-0 lg:scale-x-0 lg:scale-y-100',
        )}
      />
      {steps.map(({ title, body }, i) => {
        const Icon = ICONS[i];
        return (
          <li
            key={title}
            style={{ transitionDelay: seen ? `${200 + i * 180}ms` : '0ms' }}
            className={cn(
              'relative flex gap-5 transition-[opacity,translate] duration-500 ease-site-out lg:flex-col lg:gap-0 lg:text-center',
              seen ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
            )}
          >
            <span className="relative z-10 grid size-14 shrink-0 place-items-center rounded-full border-4 border-site-soft bg-white text-site-primary shadow-site-1 lg:mx-auto">
              <Icon className="size-6" strokeWidth={1.7} aria-hidden />
            </span>
            <div className="lg:mt-5">
              <p className="tabular text-xs font-semibold tracking-[0.16em] text-site-brass-dark uppercase">
                Step {String(i + 1).padStart(2, '0')}
              </p>
              <h3 className="mt-1 text-lg font-semibold">{title}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-site-muted">{body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
