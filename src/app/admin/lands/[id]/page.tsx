'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Handshake, Pencil, Trash2, User } from 'lucide-react';
import { LandTimeline } from '@/components/admin/lands/LandTimeline';
import { LandPaymentPlanPanel } from '@/components/admin/lands/LandPaymentPlanPanel';
import { SiteVisitPanel } from '@/components/admin/lands/SiteVisitPanel';
import { FeasibilityPanel } from '@/components/admin/lands/FeasibilityPanel';
import { DueDiligencePanel } from '@/components/admin/lands/DueDiligencePanel';
import { NegotiationPanel } from '@/components/admin/lands/NegotiationPanel';
import { AcquisitionCostPanel } from '@/components/admin/lands/AcquisitionCostPanel';
import { LocationCard } from '@/components/ui/map/LocationCard';
import { DocumentsPanel } from '@/components/admin/documents/DocumentsPanel';
import { LandStatusCard } from '@/components/admin/lands/LandStatusCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  ACQUISITION_TYPE_LABEL,
  LAND_SIZE_UNIT_LABEL,
  finalAmountLabel,
  landHeadlineAmount,
  landUsesPurchasePricing,
} from '@/lib/domain/land';
import { JV_SHARE_BASIS_LABEL } from '@/lib/domain/project';
import {
  expenseRepository,
  landRepository,
  landDdRepository,
  landNegotiationRepository,
  siteVisitRepository,
  type LandWithRelations,
} from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt, formatDate } from '@/lib/utils/format';

type Tab =
  | 'overview'
  | 'owners'
  | 'visits'
  | 'feasibility'
  | 'dd'
  | 'negotiation'
  | 'acqcost'
  | 'jv'
  | 'payments'
  | 'documents'
  | 'timeline';

/**
 * What the owners add up to, against what the land says (BRD LAND-002, BR-002).
 *
 * Three sums, each compared with the figure it should match. A row is shown
 * only when the owners have supplied that figure at all — a land where nobody
 * has recorded areas yet should say nothing about areas rather than report a
 * shortfall of the whole plot.
 */
function OwnerReconciliation({ land }: { land: LandWithRelations }) {
  const unit = LAND_SIZE_UNIT_LABEL[land.land_size_unit];
  const shareTotal = land.owners.reduce((s, o) => s + (Number(o.ownership_share_pct) || 0), 0);

  const withArea = land.owners.filter((o) => o.ownership_area != null);
  const areaTotal = withArea.reduce((s, o) => s + Number(o.ownership_area), 0);

  const withAmount = land.owners.filter((o) => o.agreed_amount != null);
  const amountTotal = withAmount.reduce((s, o) => s + Number(o.agreed_amount), 0);
  const landAgreed = Number(land.final_agreed_amount) || 0;

  const off = (a: number, b: number) => Math.abs(a - b) > 0.01;

  const lines: Array<{ label: string; value: string; warn: boolean; note?: string }> = [
    {
      label: 'Ownership shares',
      value: `${shareTotal}%`,
      warn: off(shareTotal, 100),
      note: off(shareTotal, 100) ? 'should total 100%' : undefined,
    },
  ];

  if (withArea.length) {
    lines.push({
      label: `Owner areas (${withArea.length} of ${land.owners.length})`,
      value: `${areaTotal} of ${land.land_size} ${unit}`,
      warn: withArea.length === land.owners.length && off(areaTotal, land.land_size),
      note:
        withArea.length < land.owners.length
          ? 'not recorded for every owner'
          : off(areaTotal, land.land_size)
            ? `${(areaTotal - land.land_size).toFixed(2)} ${unit} out`
            : undefined,
    });
  }

  if (withAmount.length && landAgreed > 0) {
    lines.push({
      label: `Agreed with owners (${withAmount.length} of ${land.owners.length})`,
      value: `${formatBdt(amountTotal)} of ${formatBdt(landAgreed)}`,
      warn: withAmount.length === land.owners.length && off(amountTotal, landAgreed),
      note:
        withAmount.length < land.owners.length
          ? 'not recorded for every owner'
          : off(amountTotal, landAgreed)
            ? `${formatBdt(Math.abs(amountTotal - landAgreed))} ${amountTotal > landAgreed ? 'over' : 'short'}`
            : undefined,
    });
  }

  return (
    <dl className="mt-4 space-y-2 border-t border-hairline pt-4">
      {lines.map((line) => (
        <div key={line.label} className="flex flex-wrap items-baseline justify-between gap-2">
          <dt className="text-xs text-ink-muted">{line.label}</dt>
          <dd
            className={`text-sm tabular-nums ${line.warn ? 'font-medium text-amber-700' : 'text-ink'}`}
          >
            {line.value}
            {line.note && <span className="ml-2 text-xs font-normal">({line.note})</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-hairline py-2.5 last:border-0">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="text-right text-sm font-medium text-ink">{value ?? '—'}</span>
    </div>
  );
}

/** Land detail — Design Reference A.8 (sidebar cards + tabbed main column). */
export default function LandDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('overview');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const land = useLiveQuery(() => landRepository.getWithRelations(id), [id]);
  /** what has actually been paid against this land, from the cost ledger (L-1) */
  const landCosts = useLiveQuery(() => expenseRepository.landPaymentSummary(id), [id]);
  const visitCount = useLiveQuery(() => siteVisitRepository.countForLand(id), [id]);
  // the tab badge counts what BLOCKS, not what is done — see the panel
  const ddProgress = useLiveQuery(() => landDdRepository.progressForLand(id), [id]);
  const roundCount = useLiveQuery(
    async () => (await landNegotiationRepository.listForLand(id)).length,
    [id],
  );

  if (land === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (!land) {
    return (
      <Card>
        <p className="text-sm text-ink-muted">This land no longer exists.</p>
        <Link href="/admin/lands" className="mt-3 inline-block">
          <Button variant="outline" size="sm">
            <ArrowLeft className="size-4" /> Back to lands
          </Button>
        </Link>
      </Card>
    );
  }

  const isJv = land.acquisition_type === 'joint_venture';
  const purchasePricing = landUsesPurchasePricing(land.acquisition_type);
  const headline = landHeadlineAmount(land);
  const costSheetRelevant = ['agreed', 'acquired', 'jv_signed', 'linked_to_project', 'disposed'].includes(
    land.status,
  );
  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'owners', label: `Owners (${land.owners.length})` },
    { key: 'visits', label: visitCount ? `Site Visits (${visitCount})` : 'Site Visits' },
    { key: 'feasibility', label: 'Feasibility' },
    {
      key: 'dd',
      label: ddProgress?.mandatoryOutstanding
        ? `Due Diligence (${ddProgress.mandatoryOutstanding})`
        : 'Due Diligence',
    },
    { key: 'negotiation', label: roundCount ? `Negotiation (${roundCount})` : 'Negotiation' },
    /*
     * The cost sheet is only offered once there is a deal to cost. A land
     * nobody has agreed on has no acquisition to build up, and an empty sheet
     * of nine zeroes on every sourced plot is a tab that teaches people to
     * ignore tabs.
     */
    ...(costSheetRelevant ? [{ key: 'acqcost' as Tab, label: 'Acquisition Cost' }] : []),
    ...(isJv ? [{ key: 'jv' as Tab, label: 'Joint Venture' }] : []),
    // shown for a JV too: the tab explains why there is no plan, which is more
    // use than the tab simply not being there
    { key: 'payments', label: 'Payment plan' },
    { key: 'documents', label: 'Documents' },
    { key: 'timeline', label: 'Timeline' },
  ];

  return (
    <>
      <Link
        href="/admin/lands"
        className="mb-4 inline-flex items-center gap-2 text-sm text-ink-muted hover:text-admin-700"
      >
        <ArrowLeft className="size-4" /> Back to lands
      </Link>

      <PageHeader
        title={land.name}
        subtitle={`${land.code} · ${[land.location_area, land.location_district, land.location_division].filter(Boolean).join(', ')}`}
        action={
          <div className="flex gap-2">
            <Link href={`/admin/lands/${land.id}/edit`}>
              <Button variant="outline">
                <Pencil className="size-4" /> Edit
              </Button>
            </Link>
            <Button variant="dangerGhost" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" /> Delete
            </Button>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 lg:order-1">
          <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-hairline bg-white p-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                  tab === t.key
                    ? 'bg-admin-500 text-white'
                    : 'text-ink-muted hover:bg-admin-50 hover:text-admin-700',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <div className="space-y-5">
              <Card>
                <CardHeader title="Land Information" />
                <Row label="Land name" value={land.name} />
                <Row label="Code" value={land.code} />
                <Row
                  label="Size"
                  value={`${land.land_size} ${LAND_SIZE_UNIT_LABEL[land.land_size_unit]}`}
                />
                <Row
                  label="Acquisition type"
                  value={ACQUISITION_TYPE_LABEL[land.acquisition_type]}
                />
                <Row label="Classification" value={land.land_classification} />
                <Row label="Source" value={land.source} />
                <Row label="Division" value={land.location_division} />
                <Row label="District" value={land.location_district} />
                <Row label="Upazila / Thana" value={land.location_upazila} />
                <Row label="Area" value={land.location_area} />
                <Row label="Road" value={land.road} />
                <Row label="Road access" value={land.road_access} />
                <Row label="Mouza" value={land.mouza} />
                <Row label="Dag number" value={land.dag_number} />
                <Row label="Khatian number" value={land.khatian_number} />
                <Row
                  label="GPS"
                  value={land.gps_lat && land.gps_lng ? `${land.gps_lat}, ${land.gps_lng}` : '—'}
                />
              </Card>

              <Card>
                <CardHeader title="Commercials" />
                {/* asking → negotiated → agreed is a purchase; a JV has only
                    the cash side, and showing the other two would report a
                    price nobody agreed to pay */}
                {purchasePricing && (
                  <>
                    <Row label="Asking price" value={formatBdt(land.asking_price)} />
                  </>
                )}
                <Row
                  label={finalAmountLabel(land.acquisition_type)}
                  value={formatBdt(land.final_agreed_amount)}
                />

                {/*
                  The page used to say payments were "tracked in the Finance
                  module" and stop there — no figure, no link — while EXP rows
                  worth tens of millions sat against this exact land. Paid is
                  what has actually gone out; a land payment *schedule* (what
                  is due and when) is still to come, so balance is stated as
                  agreed less paid and nothing more is implied.
                */}
                {landCosts && landCosts.count > 0 && (
                  <>
                    <Row label="Paid to date" value={formatBdt(landCosts.paid)} />
                    {landCosts.other > 0 && (
                      <Row
                        label="— of which fees and extras"
                        value={formatBdt(landCosts.other)}
                      />
                    )}
                    {(land.final_agreed_amount ?? 0) > 0 && (
                      <Row
                        label="Balance"
                        value={formatBdt((land.final_agreed_amount ?? 0) - landCosts.land_payment)}
                      />
                    )}
                  </>
                )}

                <p className="mt-3 text-xs text-ink-muted">
                  {landCosts && landCosts.count > 0 ? (
                    <>
                      From {landCosts.count} cost
                      {landCosts.count === 1 ? '' : 's'} booked against this land. Balance compares
                      the agreed amount with land-payment costs only, so registration and legal
                      fees do not reduce what the owner is still owed.{' '}
                      <button
                        type="button"
                        onClick={() => setTab('payments')}
                        className="font-medium text-admin-700 hover:underline"
                      >
                        See the agreed plan
                      </button>{' '}
                      for what was due and when.{' '}
                      <Link
                        href={`/admin/expenses?land=${land.id}`}
                        className="font-medium text-admin-700 hover:underline"
                      >
                        View the payments →
                      </Link>
                    </>
                  ) : (
                    <>
                      Nothing has been booked against this land in the cost ledger yet. Payments
                      are recorded as costs in the Finance module.{' '}
                      <Link
                        href={`/admin/expenses?land=${land.id}`}
                        className="font-medium text-admin-700 hover:underline"
                      >
                        Open the cost ledger →
                      </Link>
                    </>
                  )}
                </p>
              </Card>

              {(land.nearby_facilities || land.remarks) && (
                <Card>
                  <CardHeader title="Notes" />
                  {land.nearby_facilities && (
                    <div className="mb-4">
                      <p className="mb-1 text-sm font-medium text-ink">Nearby facilities</p>
                      <p className="whitespace-pre-wrap text-sm text-ink-muted">
                        {land.nearby_facilities}
                      </p>
                    </div>
                  )}
                  {land.remarks && (
                    <div>
                      <p className="mb-1 text-sm font-medium text-ink">Remarks</p>
                      <p className="whitespace-pre-wrap text-sm text-ink-muted">{land.remarks}</p>
                    </div>
                  )}
                </Card>
              )}
            </div>
          )}

          {tab === 'owners' && (
            <Card>
              <CardHeader
                title="Landowners"
                action={
                  <Link href={`/admin/lands/${land.id}/edit`}>
                    <Button variant="outline" size="sm">
                      <Pencil className="size-4" /> Manage
                    </Button>
                  </Link>
                }
              />
              {land.owners.length === 0 ? (
                <p className="text-sm text-ink-muted">No landowner linked to this land yet.</p>
              ) : (
                <ul className="space-y-3">
                  {land.owners.map((row) => (
                    <li
                      key={row.id}
                      className="flex items-center gap-3 rounded-xl border border-hairline p-3"
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-admin-50 text-admin-600">
                        <User className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">
                          {row.owner?.name ?? 'Unknown owner'}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {[row.owner?.phone, row.owner?.nid && `NID ${row.owner.nid}`]
                            .filter(Boolean)
                            .join(' · ') || 'No contact details'}
                        </p>
                      </div>
                      {row.is_primary_contact && <Badge tone="teal">Primary</Badge>}
                      {/* BRD LAND-002 — share, area and price, per owner */}
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-medium text-ink tabular-nums">
                          {row.ownership_share_pct}%
                          {row.ownership_area != null && (
                            <span className="text-ink-muted">
                              {' · '}
                              {row.ownership_area} {LAND_SIZE_UNIT_LABEL[land.land_size_unit]}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-ink-muted tabular-nums">
                          {row.agreed_amount != null
                            ? formatBdt(row.agreed_amount)
                            : 'No amount agreed'}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {/*
                BR-002: ownership percentages must be valid and reconciled.
                The form already refuses to save shares that do not total 100,
                so that line is a confirmation. Area and money are not
                enforced — an owner's area is what the deed says and the
                agreed amounts are settled one at a time — so a mismatch is
                reported rather than blocked, which is the point: it has to be
                visible before anybody is paid.
              */}
              {land.owners.length > 0 && <OwnerReconciliation land={land} />}
            </Card>
          )}

          {tab === 'jv' && (
            <Card>
              <CardHeader title="Joint Venture Details" />
              {!land.jv ? (
                <p className="text-sm text-ink-muted">
                  No JV terms recorded yet — add them from the edit form.
                </p>
              ) : (
                <>
                  <Row label="Developer share" value={`${land.jv.developer_share_pct}%`} />
                  <Row label="Landowner share" value={`${land.jv.landowner_share_pct}%`} />
                  <Row
                    label="Share basis"
                    value={JV_SHARE_BASIS_LABEL[land.jv.jv_share_basis ?? 'flat_count']}
                  />
                  <Row label="Agreement date" value={formatDate(land.jv.agreement_date)} />
                  <Row
                    label="Power of attorney"
                    value={
                      land.jv.power_of_attorney ? (
                        <Badge tone="green">Signed</Badge>
                      ) : (
                        <Badge tone="amber">Not signed</Badge>
                      )
                    }
                  />
                  <Row label="POA reference" value={land.jv.poa_reference} />
                </>
              )}
            </Card>
          )}

          {tab === 'visits' && (
            <Card>
              <CardHeader title="Site Visits" />
              <SiteVisitPanel land={land} />
            </Card>
          )}

          {tab === 'feasibility' && (
            <Card>
              <CardHeader title="Feasibility" />
              <FeasibilityPanel land={land} />
            </Card>
          )}

          {tab === 'dd' && (
            <Card>
              <CardHeader title="Legal Due Diligence" />
              <DueDiligencePanel land={land} />
            </Card>
          )}

          {tab === 'negotiation' && (
            <Card>
              <CardHeader title="Negotiation" />
              <NegotiationPanel land={land} />
            </Card>
          )}

          {tab === 'acqcost' && (
            <Card>
              <CardHeader title="Acquisition Cost" />
              <AcquisitionCostPanel land={land} />
            </Card>
          )}

          {tab === 'payments' && <LandPaymentPlanPanel land={land} />}

          {tab === 'timeline' && (
            <Card>
              <CardHeader title="Pipeline history" />
              <LandTimeline landId={land.id} />
            </Card>
          )}

          {tab === 'documents' && (
            <Card>
              <CardHeader title="Documents" />
              <DocumentsPanel entityType="land" entityId={land.id} />
            </Card>
          )}
        </div>

        <aside className="min-w-0 space-y-5 lg:order-2">
          <LandStatusCard land={land} />

          <LocationCard
            lat={land.gps_lat}
            lng={land.gps_lng}
            title={land.name}
            address={[land.location_area, land.location_district, land.location_division]
              .filter(Boolean)
              .join(', ')}
          />

          <Card>
            <CardHeader title="Summary" />
            <Row
              label="Size"
              value={`${land.land_size} ${LAND_SIZE_UNIT_LABEL[land.land_size_unit]}`}
            />
            <Row label={headline.label} value={formatBdt(headline.amount)} />
            <Row label="Owners" value={land.owners.length} />
            <Row label="Created" value={formatDate(land.created_at)} />
            <Row label="Last updated" value={formatDate(land.updated_at)} />
          </Card>

          {isJv && land.jv && (
            <Card>
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-admin-50 text-admin-600">
                  <Handshake className="size-5" />
                </span>
                <div>
                  <p className="text-sm font-medium text-ink">JV split</p>
                  <p className="text-xs text-ink-muted">
                    Developer {land.jv.developer_share_pct}% · Owner {land.jv.landowner_share_pct}%
                  </p>
                </div>
              </div>
            </Card>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${land.code}`}
        subtitle={land.name}
        confirmLabel="Delete land"
        message="This deletes the land along with its owner links, JV terms, pipeline history and uploaded documents. It cannot be undone."
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await landRepository.removeCascade(land.id);
          router.push('/admin/lands');
        }}
      />
    </>
  );
}
