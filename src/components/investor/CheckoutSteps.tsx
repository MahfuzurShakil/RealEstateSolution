import { Check } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const STEPS = ['Amount', 'Review', 'Secure payment', 'Receipt'];

/**
 * Where the customer is in a payment. Phones get "Step 2 of 4" with a segmented
 * bar; wider screens the full row. `current` past the last step means all done.
 */
export function CheckoutSteps({ current, failed = false }: { current: number; failed?: boolean }) {
  const label = STEPS[Math.min(current, STEPS.length - 1)];
  return (
    <nav aria-label="Payment steps">
      <div className="sm:hidden">
        <p className="flex items-baseline justify-between text-sm">
          <span className="font-semibold">{label}</span>
          <span className="tabular text-site-muted">
            Step {Math.min(current + 1, STEPS.length)} of {STEPS.length}
          </span>
        </p>
        <div className="mt-2 grid grid-cols-4 gap-1.5" aria-hidden>
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={cn(
                'h-1.5 rounded-full',
                i < current || (i === current && current === STEPS.length - 1 && !failed)
                  ? 'bg-site-primary'
                  : i === current
                    ? failed
                      ? 'bg-site-danger'
                      : 'bg-site-night'
                    : 'bg-site-line',
              )}
            />
          ))}
        </div>
      </div>

      <ol className="hidden items-center justify-center gap-3 sm:flex">
        {STEPS.map((s, i) => {
          const last = i === STEPS.length - 1;
          const done = i < current || (last && i === current && !failed);
          const on = i === current && !done;
          return (
            <li key={s} className="flex min-w-0 items-center gap-2.5" aria-current={i === current ? 'step' : undefined}>
              <span
                className={cn(
                  'tabular grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold',
                  done ? 'bg-site-primary text-white' : on ? (failed ? 'bg-site-danger text-white' : 'bg-site-night text-white ring-4 ring-site-night/10') : 'bg-white text-site-faint ring-1 ring-site-line',
                )}
              >
                {done ? <Check className="size-4" strokeWidth={3} /> : i + 1}
              </span>
              <span className={cn('truncate text-sm font-semibold', done || on ? 'text-site-ink' : 'text-site-muted')}>{s}</span>
              {!last && <span aria-hidden className={cn('h-px w-6 shrink-0 lg:w-10', i < current ? 'bg-site-primary' : 'bg-site-line')} />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
