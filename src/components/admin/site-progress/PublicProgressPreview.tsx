'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { EyeOff, Globe, ImageIcon } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { useBlobUrl } from '@/components/ui/useBlobUrl';
import { progressPublicRepository, type PublicTowerProgress } from '@/lib/repositories/public/progress.public.repository';
import { formatDate } from '@/lib/utils/format';

function TowerRow({ tower }: { tower: PublicTowerProgress }) {
  const url = useBlobUrl(tower.latest_photo?.blob);

  return (
    <li className="flex min-w-0 items-center gap-3 rounded-xl border border-hairline p-3">
      <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- a data: URL from IndexedDB, not a remote asset next/image can optimise
          <img src={url} alt="" className="size-full object-cover" />
        ) : (
          <ImageIcon className="size-5 text-slate-400" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{tower.name}</p>
        <p className="text-xs text-ink-muted">
          {tower.floor_count} floors
          {tower.latest_photo ? ` · photo ${formatDate(tower.latest_photo.taken_on)}` : ' · no public photo'}
        </p>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-admin-500"
            style={{ width: `${tower.progress_pct}%` }}
          />
        </div>
      </div>

      <span className="shrink-0 text-sm font-semibold text-ink">{tower.progress_pct}%</span>
    </li>
  );
}

/**
 * What the Public Portal will show for this project (Section 6.7).
 *
 * Two reasons this exists rather than waiting for the portal itself. It gives
 * whoever manages the project a way to check what buyers actually see before
 * they see it — the `is_public` flag on each photo is easy to set wrongly and
 * impossible to verify otherwise. And it means the whitelisted public
 * repository is exercised by real screens now, instead of being code that has
 * never run until P2 is built on top of it.
 *
 * Everything here comes through `progressPublicRepository`, never through the
 * admin repositories — same path the portal will use, so what you see is what
 * it will render.
 */
export function PublicProgressPreview({
  projectId,
  isPublic,
}: {
  projectId: string;
  /** projects.is_public — the gate for the whole portal */
  isPublic: boolean;
}) {
  const towers = useLiveQuery(
    () => progressPublicRepository.towerProgressForProject(projectId),
    [projectId],
  );
  const overall = useLiveQuery(
    () => progressPublicRepository.projectProgressPct(projectId),
    [projectId],
  );

  if (!isPublic) {
    return (
      <Card>
        <CardHeader title="On the public website" />
        <p className="flex items-start gap-2 text-sm text-ink-muted">
          <EyeOff className="mt-0.5 size-4 shrink-0" />
          This project is not published, so none of its construction progress reaches the website.
          Publish it from the project record to show tower-wise progress to buyers.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="On the public website"
        action={
          overall === null || overall === undefined ? null : (
            <span className="text-sm font-semibold text-ink">{overall}% overall</span>
          )
        }
      />
      <p className="mb-4 flex items-start gap-2 text-xs text-ink-muted">
        <Globe className="mt-0.5 size-3.5 shrink-0" />
        Exactly what a buyer sees — tower name, floor count, rounded percentage and the newest
        photo marked public. Weights, plan dates and delay never leave the admin.
      </p>

      {towers === undefined ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : towers.length === 0 ? (
        <p className="text-sm text-ink-muted">No tower to show yet.</p>
      ) : (
        <ul className="space-y-2">
          {towers.map((tower) => (
            <TowerRow key={tower.tower_id} tower={tower} />
          ))}
        </ul>
      )}
    </Card>
  );
}
