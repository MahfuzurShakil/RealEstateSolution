'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export interface WizardStep {
  label: string;
  /** a few words under the label — "3 of 3 papers" */
  sub?: string;
  /** everything this step asks for is filled in */
  done: boolean;
}

/**
 * A numbered stepper for entering a record one step at a time — the same
 * look as the land acquisition stepper (LandStageStepper): green when done,
 * teal for the step in hand, grey ahead, joined by a line on wide screens.
 * A step can be opened once every step before it is done.
 */
export function WizardStepper({ steps, active, onSelect }: { steps: WizardStep[]; active: number; onSelect: (index: number) => void }) {
  const reachable = (i: number) => steps.slice(0, i).every((s) => s.done);
  return (
    <div className="rounded-2xl border border-hairline bg-white p-3 sm:p-4">
      <ol className={cn('grid gap-2 sm:gap-0', steps.length === 5 ? 'grid-cols-2 sm:grid-cols-5' : steps.length === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3')}>
        {steps.map((step, i) => {
          const isActive = i === active;
          const open = reachable(i);
          return (
            <li key={step.label} className="relative">
              {i > 0 && <span aria-hidden className={cn('absolute top-[22px] hidden h-0.5 sm:block', steps[i - 1].done ? 'bg-emerald-400' : 'bg-slate-200')} style={{ left: '0%', right: '50%' }} />}
              {i < steps.length - 1 && <span aria-hidden className={cn('absolute top-[22px] hidden h-0.5 sm:block', step.done ? 'bg-emerald-400' : 'bg-slate-200')} style={{ left: '50%', right: '0%' }} />}
              <button
                type="button"
                disabled={!open}
                onClick={() => onSelect(i)}
                aria-current={isActive ? 'step' : undefined}
                className="group relative flex w-full items-center gap-2.5 px-2 py-2 text-left disabled:cursor-not-allowed sm:flex-col sm:gap-1.5 sm:text-center"
              >
                <span
                  className={cn(
                    'relative z-10 grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold transition-shadow',
                    step.done && !isActive ? 'bg-emerald-500 text-white' : isActive ? 'bg-admin-500 text-white' : 'border border-slate-300 bg-white text-slate-500',
                    isActive ? 'shadow-[0_0_0_3px_white,0_0_0_5px_var(--color-admin-300)]' : 'shadow-[0_0_0_3px_white]',
                  )}
                >
                  {step.done && !isActive ? <Check className="size-4" /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className={cn('block text-sm leading-tight', isActive ? 'font-semibold text-ink' : open ? 'font-medium text-ink-muted group-hover:text-ink' : 'font-medium text-slate-400')}>{step.label}</span>
                  <span className="block text-[11px] text-ink-muted">{step.sub ?? (step.done ? 'Done' : isActive ? 'In progress' : 'Not started')}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
