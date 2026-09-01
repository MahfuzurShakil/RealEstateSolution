'use client';

import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, CircleDashed, History, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import type { SiteProgressUpdate } from '@/lib/db/types';
import { siteProgressUpdateRepository } from '@/lib/repositories';
import { formatDate } from '@/lib/utils/format';
import { ProgressBar } from './ProgressBar';

/**
 * The reading history of one work item — same tree-style trail as the land and
 * project timelines, so an audit trail always looks the same in this app.
 *
 * Reads newest-first from the repository and is flipped here: a timeline is
 * read oldest-to-newest, but "what is the latest reading" has to be one query.
 */
export function ProgressLogTimeline({
  workItemId,
  highlightId,
}: {
  workItemId: string;
  /** the entry being viewed, marked out in the trail */
  highlightId?: string;
}) {
  const updates = useLiveQuery(
    () => siteProgressUpdateRepository.listForWorkItem(workItemId),
    [workItemId],
  );

  if (updates === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;

  if (updates.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No reading logged yet"
        description="Every progress update reported against this work item shows up here, with the percentage it moved to."
      />
    );
  }

  const ordered = [...updates].reverse();

  return (
    <ol className="relative space-y-4 pl-8">
      <span className="absolute bottom-3 left-[11px] top-3 w-px bg-hairline" aria-hidden />

      {ordered.map((update: SiteProgressUpdate, index) => {
        const isLatest = index === ordered.length - 1;
        const previous = index === 0 ? 0 : ordered[index - 1].progress_pct;
        const delta = Math.round((update.progress_pct - previous) * 100) / 100;
        const current = update.id === highlightId;

        return (
          <li key={update.id} className="relative">
            <span
              className={`absolute -left-8 top-3 grid size-6 place-items-center rounded-full ring-4 ring-white ${
                isLatest ? 'bg-admin-500 text-white' : 'bg-admin-100 text-admin-700'
              }`}
            >
              {isLatest ? <CircleDashed className="size-3.5" /> : <Check className="size-3.5" />}
            </span>

            <div
              className={`rounded-xl border bg-white p-4 ${
                current ? 'border-admin-300 ring-2 ring-admin-100' : 'border-hairline'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="teal">{update.progress_pct}%</Badge>
                  {delta !== 0 && (
                    <span className="text-xs text-ink-muted">
                      {delta > 0 ? '+' : '−'}
                      {Math.abs(delta)} from {previous}%
                    </span>
                  )}
                  {isLatest && <Badge tone="green">Current</Badge>}
                </div>
                <span className="text-xs font-medium text-ink">
                  {formatDate(update.update_date)}
                </span>
              </div>

              <div className="mt-3">
                <ProgressBar value={update.progress_pct} size="sm" tone="teal" />
              </div>

              {update.remarks && (
                <p className="mt-3 whitespace-pre-wrap border-t border-hairline pt-3 text-sm text-ink-muted">
                  {update.remarks}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                <span>Logged {formatDate(update.created_at)}</span>
                {update.gps_lat != null && update.gps_lng != null && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3" /> GPS recorded
                  </span>
                )}
                {!current && (
                  <Link
                    href={`/admin/site-progress/updates/${update.id}`}
                    className="text-admin-700 hover:underline"
                  >
                    Open
                  </Link>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
