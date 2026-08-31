'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { Check, CircleDashed, History } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import type { LandStatusEvent } from '@/lib/db/types';
import { LAND_STATUS_META } from '@/lib/domain/land';
import { landStatusEventRepository } from '@/lib/repositories';
import { formatBdt, formatDate } from '@/lib/utils/format';

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="text-sm text-ink">{value}</dd>
    </div>
  );
}

/** Tree-style audit trail of every pipeline step with the details captured. */
export function LandTimeline({ landId }: { landId: string }) {
  const events = useLiveQuery(() => landStatusEventRepository.listForLand(landId), [landId]);

  if (events === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;

  if (events.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No pipeline activity yet"
        description="Every status change is logged here with its date, who did it and the remarks recorded at the time."
      />
    );
  }

  return (
    <ol className="relative space-y-4 pl-8">
      {/* the trunk of the tree */}
      <span className="absolute bottom-3 left-[11px] top-3 w-px bg-hairline" aria-hidden />

      {events.map((event: LandStatusEvent, index) => {
        const meta = LAND_STATUS_META[event.to_status];
        const isLast = index === events.length - 1;
        return (
          <li key={event.id} className="relative">
            <span
              className={`absolute -left-8 top-3 grid size-6 place-items-center rounded-full ring-4 ring-white ${
                isLast ? 'bg-admin-500 text-white' : 'bg-admin-100 text-admin-700'
              }`}
            >
              {isLast ? <CircleDashed className="size-3.5" /> : <Check className="size-3.5" />}
            </span>

            <div className="rounded-xl border border-hairline bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                  <span className="text-xs text-ink-muted">
                    from {LAND_STATUS_META[event.from_status].label}
                  </span>
                </div>
                <span className="text-xs font-medium text-ink">{formatDate(event.event_date)}</span>
              </div>

              {(event.performed_by || event.amount || event.reference_no) && (
                <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                  {event.performed_by && <Detail label="By" value={event.performed_by} />}
                  {event.amount != null && (
                    <Detail label="Amount" value={formatBdt(event.amount)} />
                  )}
                  {event.reference_no && (
                    <Detail label="Reference" value={event.reference_no} />
                  )}
                </dl>
              )}

              {event.remarks && (
                <p className="mt-3 whitespace-pre-wrap border-t border-hairline pt-3 text-sm text-ink-muted">
                  {event.remarks}
                </p>
              )}

              <p className="mt-3 text-[11px] text-slate-400">
                Logged {formatDate(event.created_at)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
