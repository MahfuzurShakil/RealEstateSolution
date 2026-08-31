'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, CheckCircle2, Handshake, Info } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { JV_SHARE_BASIS_LABEL } from '@/lib/domain/project';
import { projectRepository } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';

const fmt = (value: number, basis: string) =>
  basis === 'flat_count'
    ? `${Math.round(value * 100) / 100} flat${Math.abs(value) === 1 ? '' : 's'}`
    : `${Math.round(value).toLocaleString('en-US')} sqft`;

/**
 * JV target-vs-actual (decided 2026-09-01).
 *
 * `land_jv_details` says what was agreed, `units` says what was actually
 * marked, and until now nothing compared the two — a 45% landowner share could
 * sit against any number of flats. This compares them in whichever basis the
 * JV was signed on, and warns when they diverge beyond the tolerance.
 */
export function JvAllocationCard({ projectId }: { projectId: string }) {
  const allocation = useLiveQuery(() => projectRepository.allocation(projectId), [projectId]);

  if (allocation === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;

  const { totals, by_owner, unassigned, jv_lands, summary } = allocation;
  const allocated = totals.developer.flat_count + totals.landowner.flat_count;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Unit allocation" />
        {allocated === 0 ? (
          <p className="text-sm text-ink-muted">
            No units created yet — generate them from the Towers &amp; Units tab first.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                { label: 'Developer share', totals: totals.developer, tone: 'teal' as const },
                { label: 'Landowner share', totals: totals.landowner, tone: 'amber' as const },
              ]
            ).map((row) => (
              <div key={row.label} className="rounded-xl border border-hairline p-4">
                <Badge tone={row.tone}>{row.label}</Badge>
                <p className="mt-2 text-2xl font-semibold text-ink">
                  {row.totals.flat_count}
                  <span className="ml-1 text-sm font-normal text-ink-muted">
                    flat{row.totals.flat_count === 1 ? '' : 's'}
                  </span>
                </p>
                <p className="text-sm text-ink-muted">
                  {Math.round(row.totals.total_sqft).toLocaleString('en-US')} sqft ·{' '}
                  {allocated > 0
                    ? Math.round((row.totals.flat_count / allocated) * 1000) / 10
                    : 0}
                  % of flats
                </p>
              </div>
            ))}
          </div>
        )}

        {unassigned.flat_count > 0 && (
          <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {unassigned.flat_count} landowner-share unit
            {unassigned.flat_count === 1 ? ' has' : 's have'} no owner picked yet — allocate them so
            the split below adds up.
          </p>
        )}
      </Card>

      {jv_lands.length === 0 ? (
        <Card>
          <p className="flex items-start gap-2 text-sm text-ink-muted">
            <Info className="mt-0.5 size-4 shrink-0" />
            No joint-venture land is linked to this project, so there is no agreed split to check
            against. Every unit here is the developer&apos;s to sell.
          </p>
        </Card>
      ) : summary ? (
        <Card>
          <CardHeader
            title="Agreed split vs. actual"
            action={
              <Badge tone={summary.within_tolerance ? 'green' : 'red'}>
                {summary.within_tolerance ? (
                  <>
                    <CheckCircle2 className="size-3.5" /> Matches
                  </>
                ) : (
                  <>
                    <AlertTriangle className="size-3.5" /> Mismatch
                  </>
                )}
              </Badge>
            }
          />
          <p className="mb-4 text-xs text-ink-muted">
            {jv_lands[0].land.code} · {jv_lands[0].jv.developer_share_pct}% /{' '}
            {jv_lands[0].jv.landowner_share_pct}% counted in{' '}
            {JV_SHARE_BASIS_LABEL[summary.basis].toLowerCase()} · tolerance{' '}
            {summary.tolerance_label}
          </p>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="py-2">Party</th>
                <th className="py-2">Target</th>
                <th className="py-2">Actual</th>
                <th className="py-2">Gap</th>
              </tr>
            </thead>
            <tbody>
              {[
                {
                  label: 'Developer',
                  target: summary.developer_target,
                  actual: summary.developer_actual,
                },
                {
                  label: 'Landowner',
                  target: summary.landowner_target,
                  actual: summary.landowner_actual,
                },
              ].map((row) => {
                const gap = row.actual - row.target;
                return (
                  <tr key={row.label} className="border-b border-hairline last:border-0">
                    <td className="py-2.5 font-medium text-ink">{row.label}</td>
                    <td className="py-2.5 text-ink-muted">{fmt(row.target, summary.basis)}</td>
                    <td className="py-2.5 text-ink">{fmt(row.actual, summary.basis)}</td>
                    <td
                      className={cn(
                        'py-2.5 font-medium',
                        Math.abs(gap) < 0.005
                          ? 'text-ink-muted'
                          : summary.within_tolerance
                            ? 'text-amber-600'
                            : 'text-red-600',
                      )}
                    >
                      {gap > 0 ? '+' : ''}
                      {fmt(gap, summary.basis)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {!summary.within_tolerance && (
            <p className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              The flats marked for the landowner do not match the signed agreement. Either the
              allocation is wrong, or the agreement was renegotiated and the land record needs
              updating.
            </p>
          )}
        </Card>
      ) : (
        <Card>
          <CardHeader title="Joint-venture lands" />
          <p className="mb-4 flex items-start gap-2 text-sm text-ink-muted">
            <Info className="mt-0.5 size-4 shrink-0" />
            This project sits on {jv_lands.length} JV lands. Their share percentages cannot be
            combined into one target without knowing how much of the building each land carries, so
            the terms are listed for reference and the automatic check is skipped.
          </p>
          <ul className="space-y-2">
            {jv_lands.map(({ land, jv }) => (
              <li key={land.id} className="rounded-xl border border-hairline p-3">
                <p className="text-sm font-medium text-ink">
                  {land.code} — {land.name}
                </p>
                <p className="text-xs text-ink-muted">
                  Developer {jv.developer_share_pct}% · Landowner {jv.landowner_share_pct}% · counted
                  in {JV_SHARE_BASIS_LABEL[jv.jv_share_basis ?? 'flat_count'].toLowerCase()}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {by_owner.length > 0 && (
        <Card>
          <CardHeader title="By landowner" />
          <ul className="space-y-2">
            {by_owner.map((row) => (
              <li
                key={row.owner_id}
                className="flex items-center gap-3 rounded-xl border border-hairline p-3"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-admin-50 text-admin-600">
                  <Handshake className="size-4" />
                </span>
                <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                  {row.owner?.name ?? 'Unknown owner'}
                </p>
                <Badge>{row.flat_count} flats</Badge>
                <Badge>{Math.round(row.total_sqft).toLocaleString('en-US')} sqft</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
