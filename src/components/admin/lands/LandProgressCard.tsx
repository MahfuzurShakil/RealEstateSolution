'use client';

import type { ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, ChevronRight, Info, Minus } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import type { Land } from '@/lib/db/types';
import {
  LAND_STATUS_META,
  STEP_SETS_STATUS,
  landEntryMode,
  landIsHeld,
  landStatusLabel,
} from '@/lib/domain/land';
import {
  landDdRepository,
  landDevelopmentRepository,
  landFeasibilityRepository,
  landNegotiationRepository,
  siteVisitRepository,
} from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';

export type TimelineSection = 'site' | 'legal' | 'acquisition' | 'development';

interface Step {
  key: keyof typeof STEP_SETS_STATUS;
  label: string;
  done: boolean;
  /** v29 — an owned land never went through this step; neither done nor owed */
  na?: boolean;
  /** the small count beside the label */
  count?: string;
  section: TimelineSection;
}

/**
 * The land's progress, read-only (L7, LAND-L7-PLAN.md).
 *
 * One row per step of BRD §7–11, ticked when the work behind it is done, with a
 * small count where there are several records. It does not change status —
 * status follows the work — and clicking a row only opens the Timeline section
 * where that work is recorded.
 */
export function LandProgressCard({
  land,
  onOpen,
}: {
  land: Land;
  onOpen: (section: TimelineSection) => void;
}) {
  const data = useLiveQuery(async () => {
    const [visits, studies, dd, rounds, dev] = await Promise.all([
      siteVisitRepository.listForLand(land.id),
      landFeasibilityRepository.listForLand(land.id),
      landDdRepository.progressForLand(land.id),
      landNegotiationRepository.listForLand(land.id),
      landDevelopmentRepository.readinessForLand(land.id),
    ]);
    return { visits, studies, dd, rounds, dev };
  }, [land.id, land.status]);

  const isJv = land.acquisition_type === 'joint_venture';
  const owned = landEntryMode(land) === 'owned';
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

  let steps: Step[] = [];
  if (data) {
    const { visits, studies, dd, rounds, dev } = data;
    const doneVisits = visits.filter((v) => v.status !== 'planned').length;
    const planned = visits.length - doneVisits;
    // studies come newest first; the current one's recommendation is the decision
    const current = studies[0];
    steps = [
      {
        key: 'visit',
        label: 'Site visit',
        done: doneVisits > 0,
        count: [doneVisits && plural(doneVisits, 'visit'), planned && `${planned} planned`]
          .filter(Boolean)
          .join(' · '),
        section: 'site',
      },
      {
        key: 'feasibility',
        label: 'Feasibility study',
        done: current?.recommendation === 'proceed',
        count: studies.length ? plural(studies.length, 'version') : undefined,
        section: 'site',
      },
      {
        key: 'dd',
        label: 'Legal due diligence',
        done: dd.mandatoryTotal > 0 && dd.mandatoryOutstanding === 0,
        count: dd.mandatoryTotal ? `${dd.mandatoryTotal - dd.mandatoryOutstanding}/${dd.mandatoryTotal}` : undefined,
        section: 'legal',
      },
      {
        key: 'negotiation',
        label: 'Price agreed',
        done: rounds.some((r) => r.status === 'accepted'),
        count: rounds.length ? plural(rounds.length, 'round') : undefined,
        section: 'acquisition',
      },
      {
        key: 'closing',
        label: isJv ? 'JV signed' : 'Registered',
        done: landIsHeld(land.status) || land.status === 'disposed',
        section: 'acquisition',
      },
      {
        key: 'development',
        label: 'Land development',
        done:
          land.status === 'ready_for_project' ||
          Boolean(land.no_development_required) ||
          (dev.total > 0 && dev.outstanding === 0),
        count: land.no_development_required
          ? 'not needed'
          : dev.total
            ? `${dev.total - dev.outstanding}/${dev.total}`
            : undefined,
        section: 'development',
      },
    ];
    /*
     * v29 — a land entered as already owned skipped the acquisition. Its
     * unrecorded steps are not outstanding work, so they are shown as not
     * applicable and left out of the count. Anything recorded anyway (a DD
     * check done for comfort) still ticks.
     */
    if (owned) {
      const acquisitionSteps = new Set(['visit', 'feasibility', 'dd', 'negotiation']);
      steps = steps.map((step) => {
        if (step.key === 'closing') return { ...step, label: 'Owned (entered as owned)' };
        if (acquisitionSteps.has(step.key) && !step.done) {
          return { ...step, na: true, count: undefined };
        }
        return step;
      });
    }
  }

  const counted = steps.filter((s) => !s.na);
  const done = counted.filter((s) => s.done).length;

  return (
    <Card>
      <CardHeader
        title="Progress"
        action={
          <Badge tone={LAND_STATUS_META[land.status].tone}>
            {landStatusLabel(land.status, land.acquisition_type)}
          </Badge>
        }
      />
      {data && (
        <>
          <p className="mb-3 text-xs text-ink-muted">
            {done} of {counted.length} steps done
          </p>
          <ol className="space-y-1">
            {steps.map((step) => (
              <li key={step.key}>
                {/*
                  Two lines (2026-10-21): the step's name, then its count and
                  the status it sets. On one line the narrow sidebar wrapped
                  the name and slid the count on top of it.
                */}
                <button
                  type="button"
                  onClick={() => onOpen(step.section)}
                  className="group flex w-full items-start gap-3 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-admin-50/60"
                >
                  <span className="mt-0.5">
                    <Tick done={step.done} na={step.na} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block text-sm leading-snug',
                        step.done ? 'text-ink' : step.na ? 'text-slate-400' : 'text-ink-muted',
                      )}
                    >
                      {step.label}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-slate-400">
                      {step.count && (
                        <span className="rounded-full bg-slate-100 px-1.5 py-px font-medium tabular-nums text-ink-muted">
                          {step.count}
                        </span>
                      )}
                      {/*
                        Which status this step sets, so the card and the status
                        badge stop looking like two competing lists. A step with
                        no status is a gate (feasibility) or a record.
                      */}
                      <span>
                        {step.na
                          ? 'not applicable'
                          : STEP_SETS_STATUS[step.key]
                            ? `→ ${landStatusLabel(STEP_SETS_STATUS[step.key]!, land.acquisition_type)}`
                            : 'no status change'}
                      </span>
                    </span>
                  </span>
                  <ChevronRight className="mt-1 size-3.5 shrink-0 text-slate-300 group-hover:text-admin-600" />
                </button>
              </li>
            ))}
          </ol>
          <Note>
            {owned ? (
              <>
                Entered as already owned, so the acquisition steps do not apply. Development
                still moves the status; divest from the page header.
              </>
            ) : (
              <>
                Status moves on its own as this work is recorded.{' '}
                {isJv
                  ? 'JV signing is recorded on the Joint Venture tab'
                  : 'Registration is recorded from the Registered step above (Acquisition Steps → Deal & Registration)'}
                ; reject or divest from the page header.
              </>
            )}
          </Note>
        </>
      )}
    </Card>
  );
}

function Tick({ done, na }: { done: boolean; na?: boolean }) {
  return (
    <span
      className={cn(
        'grid size-5 shrink-0 place-items-center rounded-full',
        done
          ? 'bg-emerald-500 text-white'
          : na
            ? 'border border-dashed border-slate-300 bg-slate-50 text-slate-400'
            : 'border border-slate-300 bg-white',
      )}
    >
      {done && <Check className="size-3" />}
      {na && !done && <Minus className="size-3" />}
    </span>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 flex items-start gap-2 border-t border-hairline pt-3 text-xs text-ink-muted">
      <Info className="mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
