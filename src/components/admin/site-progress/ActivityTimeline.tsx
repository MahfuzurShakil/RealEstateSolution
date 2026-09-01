'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Camera,
  CheckCircle2,
  Flag,
  History,
  Package,
  PlayCircle,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  ACTIVITY_FILTERS,
  ACTIVITY_META,
  dayHeading,
  type ActivityEvent,
  type ActivityKind,
} from '@/lib/domain/site-progress';
import { projectProgressRepository } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { todayLocal } from '@/lib/utils/format';

const ICONS: Record<ActivityKind, LucideIcon> = {
  reading: TrendingUp,
  item_started: PlayCircle,
  item_completed: CheckCircle2,
  request_raised: Package,
  request_decided: Package,
  project_status: Flag,
};

const DOT: Record<ActivityKind, string> = {
  reading: 'bg-admin-100 text-admin-700',
  item_started: 'bg-blue-100 text-blue-700',
  item_completed: 'bg-emerald-100 text-emerald-700',
  request_raised: 'bg-amber-100 text-amber-700',
  request_decided: 'bg-slate-100 text-slate-600',
  project_status: 'bg-blue-100 text-blue-700',
};

/**
 * The story of one site, in date order.
 *
 * Readings, milestones, material requests and the project's own pipeline
 * steps all describe the same construction site; kept in separate lists they
 * read as unrelated logs and nobody reconstructs the sequence by hand. Days
 * are the grouping because that is how a site diary is read.
 */
export function ActivityTimeline({ projectId }: { projectId: string }) {
  const today = todayLocal();
  const [filter, setFilter] = useState('all');

  const events = useLiveQuery(() => projectProgressRepository.activity(projectId), [projectId]);

  const filtered = useMemo(() => {
    const config = ACTIVITY_FILTERS.find((f) => f.key === filter);
    if (!config || config.kinds.length === 0) return events ?? [];
    return (events ?? []).filter((e) => config.kinds.includes(e.kind));
  }, [events, filter]);

  /** [dateLabel, events] in the order the timeline renders. */
  const days = useMemo(() => {
    const map = new Map<string, ActivityEvent[]>();
    for (const event of filtered) {
      const list = map.get(event.date) ?? [];
      list.push(event);
      map.set(event.date, list);
    }
    return [...map.entries()];
  }, [filtered]);

  if (events === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-1.5">
        {ACTIVITY_FILTERS.map((option) => {
          const count =
            option.kinds.length === 0
              ? events.length
              : events.filter((e) => option.kinds.includes(e.kind)).length;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => setFilter(option.key)}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                filter === option.key
                  ? 'bg-admin-500 text-white'
                  : 'border border-hairline bg-white text-ink-muted hover:bg-admin-50 hover:text-admin-700',
              )}
            >
              {option.label}
              <span className={cn('ml-1.5', filter === option.key ? 'text-white/70' : 'text-slate-400')}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={History}
          title={events.length === 0 ? 'Nothing has happened here yet' : 'Nothing of this kind yet'}
          description={
            events.length === 0
              ? 'Progress readings, material requests and project stage changes all land in this timeline as they happen.'
              : 'Try another filter — the rest of the site activity is still there.'
          }
        />
      ) : (
        <div className="space-y-6">
          {days.map(([date, dayEvents]) => (
            <section key={date}>
              <h3 className="mb-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {dayHeading(date, today)}
                <span className="h-px flex-1 bg-hairline" />
                <span className="font-normal normal-case tracking-normal">
                  {dayEvents.length} {dayEvents.length === 1 ? 'entry' : 'entries'}
                </span>
              </h3>

              <ol className="relative space-y-3 pl-8">
                <span className="absolute bottom-3 left-[11px] top-3 w-px bg-hairline" aria-hidden />

                {dayEvents.map((event) => {
                  const Icon = ICONS[event.kind];
                  const meta = ACTIVITY_META[event.kind];
                  const delta =
                    event.progress_pct != null && event.previous_pct != null
                      ? Math.round((event.progress_pct - event.previous_pct) * 100) / 100
                      : null;

                  const body = (
                    <div
                      className={cn(
                        'rounded-xl border border-hairline bg-white p-4',
                        event.href && 'transition-colors hover:bg-admin-50/40',
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink">{event.title}</p>
                          {event.context && (
                            <p className="mt-0.5 text-xs text-ink-muted">{event.context}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          {delta !== null && delta !== 0 && (
                            <Badge tone="neutral">
                              {delta > 0 ? '+' : '−'}
                              {Math.abs(delta)}%
                            </Badge>
                          )}
                          {event.photo_count ? (
                            <Badge tone="teal">
                              <Camera className="size-3.5" />
                              {event.photo_count}
                            </Badge>
                          ) : null}
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                        </div>
                      </div>

                      {event.detail && (
                        <p className="mt-2.5 whitespace-pre-wrap border-t border-hairline pt-2.5 text-sm text-ink-muted">
                          {event.detail}
                        </p>
                      )}

                      {event.actor && (
                        <p className="mt-2.5 text-[11px] text-slate-400">{event.actor}</p>
                      )}
                    </div>
                  );

                  return (
                    <li key={event.id} className="relative">
                      <span
                        className={cn(
                          'absolute -left-8 top-3 grid size-6 place-items-center rounded-full ring-4 ring-white',
                          DOT[event.kind],
                        )}
                      >
                        <Icon className="size-3.5" />
                      </span>
                      {event.href ? (
                        <Link href={event.href} className="block">
                          {body}
                        </Link>
                      ) : (
                        body
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
