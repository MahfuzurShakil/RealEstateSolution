'use client';

import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, Map as MapIcon, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import type { Land } from '@/lib/db/types';
import {
  LAND_ENTRY_MODE_LABEL,
  LAND_SIZE_UNIT_LABEL,
  LAND_STATUS_META,
  landEntryMode,
  landStatusLabel,
} from '@/lib/domain/land';
import { LAND_READINESS_META, landReadiness } from '@/lib/domain/project';
import { landAcquisitionCostRepository } from '@/lib/repositories';
import { formatBdt } from '@/lib/utils/format';

/**
 * v29 — the ground under a project (PLATFORM-REPLAN.md §1.2).
 *
 * Each linked land with its own status and what it has cost so far, plus the
 * project's land readiness, which is what opening sales and starting
 * construction are checked against. This is where a project started before
 * its land was finished sends people to finish it.
 */
export function ProjectLandCard({ projectId, lands }: { projectId: string; lands: Land[] }) {
  const readiness = landReadiness(lands);
  const meta = LAND_READINESS_META[readiness];
  const sheets = useLiveQuery(
    async () =>
      Object.fromEntries(
        await Promise.all(
          lands.map(async (l) => [l.id, await landAcquisitionCostRepository.sheetForLand(l.id)] as const),
        ),
      ),
    [lands.map((l) => `${l.id}:${l.status}`).join(',')],
  );

  return (
    <Card>
      <CardHeader
        title="Land"
        subtitle={meta.hint}
        action={<Badge tone={meta.tone}>{meta.label}</Badge>}
      />
      {lands.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-hairline p-4">
          <p className="text-sm text-ink-muted">No land linked to this project yet.</p>
          <Link href={`/admin/projects/${projectId}/edit`}>
            <Button variant="outline" size="sm">
              <Pencil className="size-4" /> Link or add land
            </Button>
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {lands.map((land) => {
            const sheet = sheets?.[land.id];
            return (
              <li key={land.id}>
                <Link
                  href={`/admin/lands/${land.id}`}
                  className="group flex items-center gap-3 rounded-xl border border-hairline p-3 transition-colors hover:bg-admin-50/60"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-admin-50 text-admin-600">
                    <MapIcon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-ink">{land.name}</span>
                      <Badge tone={LAND_STATUS_META[land.status].tone}>
                        {landStatusLabel(land.status, land.acquisition_type)}
                      </Badge>
                    </p>
                    <p className="text-xs text-ink-muted">
                      {land.code} · {land.land_size} {LAND_SIZE_UNIT_LABEL[land.land_size_unit]} ·{' '}
                      {LAND_ENTRY_MODE_LABEL[landEntryMode(land)]}
                    </p>
                  </div>
                  {sheet && (
                    <div className="hidden shrink-0 text-right sm:block">
                      <p className="text-sm font-semibold tabular-nums text-ink">
                        {formatBdt(sheet.actualTotal)}
                      </p>
                      <p className="text-[11px] text-ink-muted">
                        spent · est. {formatBdt(sheet.estimatedTotal)}
                      </p>
                    </div>
                  )}
                  <ChevronRight className="size-4 shrink-0 text-slate-300 group-hover:text-admin-600" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
