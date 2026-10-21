'use client';

import { ArrowRight, Check, Lightbulb } from 'lucide-react';
import type { LandStatus } from '@/lib/db/types';
import type { WaitingKey } from '@/lib/domain/land';
import { cn } from '@/lib/utils/cn';
import type { TimelineSection } from './LandProgressCard';

export interface Stage {
  key: TimelineSection;
  label: string;
  done: boolean;
  /** a few words under the label — "2 visits", "4/6 papers" */
  sub?: string;
}

/** The stage a status sits in — what Acquisition Steps opens on. */
export function sectionForStatus(status: LandStatus): TimelineSection {
  switch (status) {
    case 'dd_in_progress':
      return 'legal';
    case 'negotiation':
    case 'agreed':
      return 'acquisition';
    case 'acquired':
    case 'under_development':
    case 'ready_for_project':
    case 'disposed':
      return 'development';
    default:
      return 'site';
  }
}

/** Where the work a land is waiting on gets recorded. */
export const SECTION_FOR_WAITING: Partial<Record<WaitingKey, TimelineSection>> = {
  visit: 'site',
  feasibility: 'site',
  dd: 'legal',
  negotiation: 'acquisition',
  registration: 'acquisition',
  development: 'development',
};

/**
 * The four stages of acquiring a land as a numbered stepper (2026-10-21).
 *
 * Replaces a row of equal pills that gave no sense of order or of where the
 * land stood. The stage the land is in is marked, finished ones are ticked,
 * and the line above says the one thing to do next, with a jump to where it
 * is recorded.
 */
export function LandStageStepper({
  stages,
  active,
  current,
  next,
  onSelect,
}: {
  stages: Stage[];
  active: TimelineSection;
  /** the stage the land's status is in */
  current: TimelineSection;
  next?: { text: string; section?: TimelineSection };
  onSelect: (section: TimelineSection) => void;
}) {
  return (
    <div className="rounded-2xl border border-hairline bg-white p-3 sm:p-4">
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-0">
        {stages.map((stage, i) => {
          const isActive = stage.key === active;
          const isCurrent = stage.key === current && !stage.done;
          return (
            <li key={stage.key} className="relative">
              {/* the connector, desktop only: half a line either side of the dot */}
              {i > 0 && (
                <span
                  aria-hidden
                  className={cn(
                    'absolute top-[22px] hidden h-0.5 sm:block',
                    stages[i - 1].done ? 'bg-emerald-400' : 'bg-slate-200',
                  )}
                  style={{ left: '0%', right: '50%' }}
                />
              )}
              {i < stages.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    'absolute top-[22px] hidden h-0.5 sm:block',
                    stage.done ? 'bg-emerald-400' : 'bg-slate-200',
                  )}
                  style={{ left: '50%', right: '0%' }}
                />
              )}
              <button
                type="button"
                onClick={() => onSelect(stage.key)}
                aria-current={isActive ? 'step' : undefined}
                className="group relative flex w-full items-center gap-2.5 px-2 py-2 text-left sm:flex-col sm:gap-1.5 sm:text-center"
              >
                {/*
                  The number's colour says where the land is (green done, teal
                  current, grey ahead); the stage being viewed only gets a ring
                  and a bold label — no box (2026-10-21).
                */}
                <span
                  className={cn(
                    'relative z-10 grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold transition-shadow',
                    stage.done
                      ? 'bg-emerald-500 text-white'
                      : isCurrent
                        ? 'bg-admin-500 text-white'
                        : 'border border-slate-300 bg-white text-slate-500',
                    isActive
                      ? stage.done
                        ? 'shadow-[0_0_0_3px_white,0_0_0_5px_var(--color-emerald-300)]'
                        : 'shadow-[0_0_0_3px_white,0_0_0_5px_var(--color-admin-300)]'
                      : 'shadow-[0_0_0_3px_white] group-hover:shadow-[0_0_0_3px_white,0_0_0_5px_var(--color-slate-200)]',
                  )}
                >
                  {stage.done ? <Check className="size-4" /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      'block text-sm leading-tight',
                      isActive ? 'font-semibold text-ink' : 'font-medium text-ink-muted group-hover:text-ink',
                    )}
                  >
                    {stage.label}
                  </span>
                  <span className="block text-[11px] text-ink-muted">
                    {stage.done ? 'Done' : isCurrent ? 'In progress' : 'Not started'}
                    {stage.sub ? ` · ${stage.sub}` : ''}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {next && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-admin-100 bg-admin-50/60 px-3 py-2">
          <Lightbulb className="size-4 shrink-0 text-admin-600" />
          <p className="min-w-0 flex-1 text-sm text-ink">
            <span className="font-medium">Next:</span> {next.text}
          </p>
          {next.section && next.section !== active && (
            <button
              type="button"
              onClick={() => onSelect(next.section!)}
              className="inline-flex items-center gap-1 text-sm font-medium text-admin-700 hover:underline"
            >
              Go there <ArrowRight className="size-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
