'use client';

import type { ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, ChevronRight, Info } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import type { Land } from '@/lib/db/types';
import { LAND_STATUS_META, landIsHeld } from '@/lib/domain/land';
import {
  landDdRepository,
  landDevelopmentRepository,
  landFeasibilityRepository,
  landNegotiationRepository,
  paymentScheduleRepository,
  siteVisitRepository,
} from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';

export type TimelineSection = 'site' | 'legal' | 'acquisition' | 'development';

interface Step {
  key: string;
  label: string;
  done: boolean;
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
    const [visits, studies, dd, rounds, schedule, dev] = await Promise.all([
      siteVisitRepository.listForLand(land.id),
      landFeasibilityRepository.listForLand(land.id),
      landDdRepository.progressForLand(land.id),
      landNegotiationRepository.listForLand(land.id),
      paymentScheduleRepository.withInstallmentsForLand(land.id),
      landDevelopmentRepository.readinessForLand(land.id),
    ]);
    return { visits, studies, dd, rounds, schedule, dev };
  }, [land.id, land.status]);

  const isJv = land.acquisition_type === 'joint_venture';
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

  let steps: Step[] = [];
  if (data) {
    const { visits, studies, dd, rounds, schedule, dev } = data;
    const doneVisits = visits.filter((v) => v.status !== 'planned').length;
    const planned = visits.length - doneVisits;
    const approved = studies.find((s) => s.status === 'approved');
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
        label: 'Feasibility approved',
        done: approved?.recommendation === 'proceed',
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
        key: 'settlement',
        label: 'Settlement schedule',
        // a JV paid only in units has no cash to schedule, once it is signed
        done: Boolean(schedule) || (isJv && landIsHeld(land.status) && !(Number(land.final_agreed_amount) > 0)),
        count: schedule
          ? plural(schedule.installments.length, 'instalment')
          : isJv && landIsHeld(land.status) && !(Number(land.final_agreed_amount) > 0)
            ? 'not needed'
            : undefined,
        section: 'acquisition',
      },
      {
        key: 'closing',
        label: isJv ? 'JV signed' : 'Acquired',
        done: landIsHeld(land.status) || land.status === 'disposed',
        section: 'acquisition',
      },
      {
        key: 'development',
        label: 'Land development',
        done: Boolean(land.no_development_required) || (dev.total > 0 && dev.outstanding === 0),
        count: land.no_development_required
          ? 'not needed'
          : dev.total
            ? `${dev.total - dev.outstanding}/${dev.total}`
            : undefined,
        section: 'development',
      },
    ];
  }

  const done = steps.filter((s) => s.done).length;

  return (
    <Card>
      <CardHeader
        title="Progress"
        action={
          <Badge tone={LAND_STATUS_META[land.status].tone}>{LAND_STATUS_META[land.status].label}</Badge>
        }
      />
      {data && (
        <>
          <p className="mb-3 text-xs text-ink-muted">
            {done} of {steps.length} steps done
          </p>
          <ol className="space-y-1">
            {steps.map((step) => (
              <li key={step.key}>
                <button
                  type="button"
                  onClick={() => onOpen(step.section)}
                  className="group flex w-full items-center gap-3 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-admin-50/60"
                >
                  <Tick done={step.done} />
                  <span className={cn('min-w-0 flex-1 text-sm', step.done ? 'text-ink' : 'text-ink-muted')}>
                    {step.label}
                  </span>
                  {step.count && (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium tabular-nums text-ink-muted">
                      {step.count}
                    </span>
                  )}
                  <ChevronRight className="size-3.5 shrink-0 text-slate-300 group-hover:text-admin-600" />
                </button>
              </li>
            ))}
          </ol>
          <Note>
            Status moves on its own as this work is recorded.{' '}
            {isJv
              ? 'JV signing is recorded on the Joint Venture tab'
              : 'Registration is recorded under Negotiation & Acquisition'}
            ; reject or dispose from the page header.
          </Note>
        </>
      )}
    </Card>
  );
}

function Tick({ done }: { done: boolean }) {
  return (
    <span
      className={cn(
        'grid size-5 shrink-0 place-items-center rounded-full',
        done ? 'bg-emerald-500 text-white' : 'border border-slate-300 bg-white',
      )}
    >
      {done && <Check className="size-3" />}
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
