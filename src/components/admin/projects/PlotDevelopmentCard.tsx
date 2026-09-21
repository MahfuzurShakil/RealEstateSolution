'use client';

import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { landDevelopmentRepository, landProjectMappingRepository } from '@/lib/repositories';
import { formatBdt } from '@/lib/utils/format';

/**
 * Phase 3 — a plot scheme's progress, read from the land it stands on.
 *
 * A plot project has no Site Progress tab: its "construction" is the filling,
 * the roads and the drains, and those are recorded against the land in
 * Module 1 (BRD DEV-001…004). A second progress log on the project would be a
 * second answer to "is the land ready". This card shows the one that exists,
 * and it is the same record that gates possession on each plot.
 */
export function PlotDevelopmentCard({ projectId }: { projectId: string }) {
  const rows = useLiveQuery(async () => {
    const lands = await landProjectMappingRepository.landsForProject(projectId);
    return Promise.all(
      lands.map(async (land) => ({ land, readiness: await landDevelopmentRepository.readinessForLand(land.id) })),
    );
  }, [projectId]);

  if (!rows) return null;

  return (
    <Card>
      <CardHeader title="Land Development" />
      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted">No land is linked to this project yet.</p>
      ) : (
        <div className="space-y-3">
          {rows.map(({ land, readiness: r }) => (
            <div key={land.id} className="rounded-xl border border-hairline p-3">
              <div className="flex items-center justify-between gap-2">
                <Link href={`/admin/lands/${land.id}`} className="text-sm font-medium text-ink hover:text-admin-700">
                  {land.code} — {land.name}
                </Link>
                <Badge tone={r.total === 0 ? 'neutral' : r.outstanding === 0 ? 'green' : 'amber'}>
                  {r.total === 0 ? 'Nothing recorded' : r.outstanding === 0 ? 'Finished' : `${r.outstanding} open`}
                </Badge>
              </div>
              {r.total > 0 && (
                <p className="mt-1 text-xs text-ink-muted">
                  {r.completed} of {r.total} activities complete · {formatBdt(r.incurredTotal)} spent of{' '}
                  {formatBdt(r.budgetTotal)} budgeted
                </p>
              )}
            </div>
          ))}
          <p className="text-xs text-ink-muted">
            Plots are handed over only once every activity here is finished.
          </p>
        </div>
      )}
    </Card>
  );
}
