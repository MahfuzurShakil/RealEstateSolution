'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft,
  Handshake,
  Pencil,
  PlayCircle,
  Scale,
  Trash2,
  User,
  Wrench,
} from 'lucide-react';
import { LandTimeline } from '@/components/admin/lands/LandTimeline';
import { SiteVisitPanel } from '@/components/admin/lands/SiteVisitPanel';
import { FeasibilityPanel } from '@/components/admin/lands/FeasibilityPanel';
import { DueDiligencePanel } from '@/components/admin/lands/DueDiligencePanel';
import { NegotiationPanel } from '@/components/admin/lands/NegotiationPanel';
import { LandCostPanel } from '@/components/admin/lands/LandCostPanel';
import { DevelopmentPanel } from '@/components/admin/lands/DevelopmentPanel';
import { LocationCard } from '@/components/ui/map/LocationCard';
import { DocumentsPanel } from '@/components/admin/documents/DocumentsPanel';
import { LandProgressCard, type TimelineSection } from '@/components/admin/lands/LandProgressCard';
import {
  LandStageStepper,
  SECTION_FOR_WAITING,
  type Stage,
  sectionForStatus,
} from '@/components/admin/lands/LandStageStepper';
import { LandClosingCard } from '@/components/admin/lands/LandClosingCard';
import { Fact, FactGroup } from '@/components/admin/lands/LandFacts';
import { LandMoneyCard } from '@/components/admin/lands/LandMoneyCard';
import { LandEventDialog } from '@/components/admin/lands/LandEventDialog';
import { CorrectStatusDialog } from '@/components/admin/lands/CorrectStatusDialog';
import { OwnerAmountsDialog } from '@/components/admin/lands/OwnerAmountsDialog';
import { Badge } from '@/components/ui/Badge';
import { ViewOnlyArea, ViewOnlyNotice } from '@/components/ui/ViewOnly';
import { useMockSession } from '@/lib/auth/mock-session';
import { canCorrectLandStatus, canEdit } from '@/lib/domain/access';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  ACQUISITION_TYPE_LABEL,
  LAND_SIZE_UNIT_LABEL,
  allowedNextStatuses,
  correctableStatuses,
  landStatusLabel,
  statusStepConfig,
  landHeadlineAmount,
  landEntryMode,
  landIsHeld,
} from '@/lib/domain/land';
import { JV_SHARE_BASIS_LABEL } from '@/lib/domain/project';
import {
  landRepository,
  landDdRepository,
  landFeasibilityRepository,
  landNegotiationRepository,
  ownerSettlementRepository,
  landDevelopmentRepository,
  landPipelineRepository,
  landProjectMappingRepository,
  siteVisitRepository,
  userRepository,
  type LandWithRelations,
} from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt, formatDate, todayLocal } from '@/lib/utils/format';

import type { LandStatus } from '@/lib/db/types';
import { LandPapersPanel, OwnedLandCard } from '@/components/admin/lands/OwnedLandPanels';

/**
 * L7 (LAND-L7-PLAN.md) — five tabs. The land record, its owners, the JV terms
 * and the documents are one tab each; everything that *happens* to the land
 * lives under Timeline, in the four sections BRD §8–11 names.
 */
type Tab = 'overview' | 'owners' | 'jv' | 'papers' | 'cost' | 'documents' | 'timeline' | 'development';

const SECTIONS: { key: TimelineSection; label: string }[] = [
  // 2026-10-23 — visit and feasibility are two steps, each with its own record
  { key: 'site', label: 'Site Visit' },
  { key: 'feasibility', label: 'Feasibility' },
  { key: 'legal', label: 'Legal Due Diligence' },
  { key: 'acquisition', label: 'Deal & Registration' },
];

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
  // QA audit X-01 — the land team acts; everyone else with access reads
  const { role } = useMockSession();
  const mayEdit = canEdit(role, 'land');
  // null until someone picks one — the Timeline opens on the stage the land is in
  const [section, setSection] = useState<TimelineSection | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deciding, setDeciding] = useState<LandStatus | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [editingAmounts, setEditingAmounts] = useState(false);
  const [resuming, setResuming] = useState(false);

  const land = useLiveQuery(() => landRepository.getWithRelations(id), [id]);
  const visitCount = useLiveQuery(() => siteVisitRepository.countForLand(id), [id]);
  // newest first: the current study's recommendation is the decision
  const studies = useLiveQuery(() => landFeasibilityRepository.listForLand(id), [id]);
  // the tab badge counts what BLOCKS, not what is done — see the panel
  const ddProgress = useLiveQuery(() => landDdRepository.progressForLand(id), [id]);
  // BRD LAND-002 / ACQ-003 — what each owner is owed and what has gone to them
  const settlement = useLiveQuery(() => ownerSettlementRepository.positionForLand(id), [id]);
  const assignee = useLiveQuery(
    () => (land?.assigned_to ? userRepository.getById(land.assigned_to) : Promise.resolve(undefined)),
    [land?.assigned_to],
  );
  const devReadiness = useLiveQuery(
    () => landDevelopmentRepository.readinessForLand(id),
    [id],
  );
  // QA 2026-10-11 — say why a delete is refused before anyone clicks it
  const deleteBlocked = useLiveQuery(() => landRepository.deleteBlockReason(id), [id]);
  // v29 — "in a project" is a mapping, not a status
  const inProjects = useLiveQuery(() => landProjectMappingRepository.projectsForLand(id), [id]);
  const roundCount = useLiveQuery(
    async () => (await landNegotiationRepository.listForLand(id)).length,
    [id],
  );
  // the one thing this land needs next — the same line the land list shows
  const waitingOn = useLiveQuery(
    async () => {
      const row = await landRepository.getById(id);
      return row ? (await landPipelineRepository.waitingOnForLands([row])).get(id) : undefined;
    },
    [id, land?.status, visitCount, ddProgress?.mandatoryOutstanding, roundCount, devReadiness?.outstanding],
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
  // LAND-OWNED-FLOW-PLAN.md — land already held gets its own, shorter screen
  const owned = landEntryMode(land) === 'owned';
  // the land is ours (or was, once disposed): only then is there development to record
  const held = owned || landIsHeld(land.status) || land.status === 'disposed';
  const inProject = (inProjects?.length ?? 0) > 0;
  const canEditOwnerAmounts =
    land.owners.length > 0 &&
    (Number(land.final_agreed_amount) || 0) > 0 &&
    (land.status === 'agreed' || landIsHeld(land.status) || land.status === 'disposed');
  const headline = landHeadlineAmount(land);
  // 2026-10-21 — the work first, then the money, then the parties and papers
  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    // 2026-10-23 — development is its own tab, opened once the land is ours
    ...(owned ? [] : [{ key: 'timeline' as Tab, label: 'Acquisition' }]),
    ...(held ? [{ key: 'development' as Tab, label: 'Development' }] : []),
    // budget, deal, paid and pending, with the payments
    { key: 'cost', label: 'Land Cost' },
    {
      key: 'owners',
      label: `${owned && land.acquisition_type === 'inherited' ? 'Heirs' : 'Owners'} (${land.owners.length})`,
    },
    ...(isJv ? [{ key: 'jv' as Tab, label: 'Joint Venture' }] : []),
    ...(owned ? [{ key: 'papers' as Tab, label: 'Papers' }] : []),
    { key: 'documents', label: 'Documents' },
  ];
  const currentSection = sectionForStatus(land.status);
  const activeSection: TimelineSection = section && section !== 'development' ? section : currentSection;
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
  const stages = SECTIONS.map((sec): Stage => {
    switch (sec.key) {
      case 'site':
        return {
          ...sec,
          done: Boolean(visitCount) || !['sourced', 'on_hold', 'rejected'].includes(land.status),
          sub: visitCount ? plural(visitCount, 'visit') : undefined,
        };
      case 'feasibility':
        return {
          ...sec,
          // same rule as the Progress card: the current study says proceed
          done: studies?.[0]?.recommendation === 'proceed',
          started: Boolean(studies?.length),
          sub: studies?.length ? plural(studies.length, 'version') : undefined,
        };
      case 'legal':
        return {
          ...sec,
          done: Boolean(ddProgress && ddProgress.mandatoryTotal > 0 && ddProgress.mandatoryOutstanding === 0),
          sub: ddProgress?.mandatoryTotal
            ? `${ddProgress.mandatoryTotal - ddProgress.mandatoryOutstanding}/${ddProgress.mandatoryTotal} papers`
            : undefined,
        };
      default:
        return {
          ...sec,
          done: landIsHeld(land.status) || land.status === 'disposed',
          sub: roundCount ? plural(roundCount, 'round') : undefined,
        };
    }
  });
  const openSection = (next: TimelineSection) => {
    // development work lives on its own tab; before the land is ours there is none to open
    if (next === 'development') {
      if (held) setTab('development');
    } else {
      setTab('timeline');
      setSection(next);
    }
    // the card sits beside the tabs on desktop and under them on a phone
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <ViewOnlyArea readOnly={!mayEdit}>
      <Link
        href="/admin/lands"
        className="mb-4 inline-flex items-center gap-2 text-sm text-ink-muted hover:text-admin-700"
      >
        <ArrowLeft className="size-4" /> Back to lands
      </Link>

      <PageHeader
        title={land.name}
        subtitle={
          <>
            {`${land.code} · ${[land.location_area, land.location_district, land.location_division].filter(Boolean).join(', ')}`}
            {(inProjects ?? []).map((p) => (
              <Link
                key={p.id}
                href={`/admin/projects/${p.id}`}
                className="ml-2 inline-flex align-middle"
              >
                <Badge tone="teal">In project {p.code}</Badge>
              </Link>
            ))}
          </>
        }
        action={
          <div className="flex flex-wrap gap-2">
            {/* the decisions only a person can make — everything else follows the work */}
            {mayEdit &&
              allowedNextStatuses(land.status)
              /*
               * A project stands on it: the project has to release it first.
               * QA audit L-02 — that goes for parking or dropping it too, not
               * only divesting: the project would otherwise sit on a rejected
               * land with nothing on the project saying why.
               */
              .filter((to) => !(inProject && ['disposed', 'on_hold', 'rejected'].includes(to)))
              // nothing is being chased on an owned land, so it is not parked or dropped
              .filter((to) => !(owned && ['on_hold', 'rejected'].includes(to)))
              .map((to) => (
              <Button
                key={to}
                variant={to === 'rejected' ? 'dangerGhost' : 'outline'}
                onClick={() => setDeciding(to)}
              >
                {statusStepConfig(to, land.acquisition_type)?.confirmLabel ??
                  landStatusLabel(to, land.acquisition_type)}
              </Button>
            ))}
            {/* a parked land is put back where it was, and then re-checked */}
            {mayEdit && land.status === 'on_hold' && (
              <Button onClick={() => setResuming(true)}>
                <PlayCircle className="size-4" /> Resume
              </Button>
            )}
            {/* QA audit L-01 — an override of the gates, so a director's call */}
            {canCorrectLandStatus(role) && correctableStatuses(land.status, inProject).length > 0 && (
              <ViewOnlyArea readOnly={false}>
              <Button variant="ghost" onClick={() => setCorrecting(true)} title="Correct this status">
                <Wrench className="size-4" /> Correct status
              </Button>
              </ViewOnlyArea>
            )}
            {mayEdit && (
              <Link href={`/admin/lands/${land.id}/edit`}>
                <Button variant="outline">
                  <Pencil className="size-4" /> Edit
                </Button>
              </Link>
            )}
            {mayEdit && (
              <Button variant="dangerGhost" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-4" /> Delete
              </Button>
            )}
          </div>
        }
      />
      {!mayEdit && <ViewOnlyNotice what="land" />}

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
                {/*
                  2026-10-21 — grouped and laid across, label over value: the
                  one-fact-per-line list was sixteen rows of scrolling with
                  most of the card empty.
                */}
                <FactGroup title="Basics">
                  <Fact label="Land name" value={land.name} />
                  <Fact label="Code" value={land.code} />
                  <Fact
                    label="Size"
                    value={`${land.land_size} ${LAND_SIZE_UNIT_LABEL[land.land_size_unit]}`}
                  />
                  <Fact label="Acquisition type" value={ACQUISITION_TYPE_LABEL[land.acquisition_type]} />
                  <Fact label="Classification" value={land.land_classification} />
                  {!owned && <Fact label="Source" value={land.source} />}
                  {/* BRD LAND-001 — the land officer on this plot (2026-10-04) */}
                  {!owned && <Fact label="Assigned to" value={assignee?.name} />}
                </FactGroup>
                <FactGroup title="Location">
                  <Fact label="Area" value={land.location_area} />
                  <Fact label="Upazila / Thana" value={land.location_upazila} />
                  <Fact label="District" value={land.location_district} />
                  <Fact label="Division" value={land.location_division} />
                  <Fact label="Road" value={land.road} />
                  <Fact
                    label="Front road width"
                    value={land.front_road_width_ft ? `${land.front_road_width_ft} ft` : null}
                  />
                  <Fact label="Road access" value={land.road_access} />
                  <Fact
                    label="GPS"
                    value={land.gps_lat && land.gps_lng ? `${land.gps_lat}, ${land.gps_lng}` : null}
                  />
                </FactGroup>
                <FactGroup title="Land records" last>
                  <Fact label="Mouza" value={land.mouza} />
                  <Fact label="Dag number" value={land.dag_number} />
                  <Fact label="Khatian number" value={land.khatian_number} />
                </FactGroup>
              </Card>

              {/* 2026-10-21 — read from the cost sheet, so it matches Land Cost */}
              {!owned && <LandMoneyCard land={land} onOpenCost={() => setTab('cost')} />}

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

              {/* every status change, with what caused it */}
              <Card>
                <CardHeader
                  title="Status changes"
                  action={<span className="text-xs text-ink-muted">Newest first</span>}
                />
                <LandTimeline landId={land.id} acquisitionType={land.acquisition_type} />
              </Card>
            </div>
          )}

          {tab === 'owners' && (
            <Card>
              <CardHeader
                title="Landowners"
                action={
                  <div className="flex flex-wrap gap-2">
                    {/* amounts exist once a price does (BRD LAND-002) */}
                    {canEditOwnerAmounts && (
                      <Button variant="outline" size="sm" onClick={() => setEditingAmounts(true)}>
                        <Scale className="size-4" /> Agreed amounts
                      </Button>
                    )}
                    <Link href={`/admin/lands/${land.id}/edit`}>
                      <Button variant="outline" size="sm">
                        <Pencil className="size-4" /> Manage
                      </Button>
                    </Link>
                  </div>
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
                      {/* BRD LAND-002 — share, area, price, paid and due per owner */}
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
                        {(() => {
                          const s = settlement?.owners.find((o) => o.mapping.id === row.id);
                          if (!s || s.agreed <= 0) {
                            return (
                              <p className="text-xs text-ink-muted">No amount agreed</p>
                            );
                          }
                          return (
                            <p className="text-xs tabular-nums">
                              <span className="text-ink-muted">{formatBdt(s.agreed)}</span>
                              {' · '}
                              <span
                                className={
                                  s.outstanding > 0 ? 'text-amber-700' : 'text-emerald-700'
                                }
                              >
                                {s.outstanding > 0
                                  ? `${formatBdt(s.outstanding)} due`
                                  : 'settled in full'}
                              </span>
                            </p>
                          );
                        })()}
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
            <div className="space-y-5">
              <LandClosingCard land={land} />
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
            </div>
          )}

          {tab === 'timeline' && (
            <div className="space-y-5">
              <LandStageStepper
                stages={stages}
                active={activeSection}
                current={currentSection}
                next={
                  waitingOn && waitingOn.key !== 'nothing'
                    ? { text: waitingOn.text, section: SECTION_FOR_WAITING[waitingOn.key] }
                    : undefined
                }
                onSelect={openSection}
              />

              {activeSection === 'site' && (
                <>
                  <Card>
                    <CardHeader title="Site Visits" />
                    <SiteVisitPanel land={land} />
                  </Card>
                </>
              )}

              {activeSection === 'feasibility' && (
                <Card>
                  <CardHeader title="Feasibility" />
                  <FeasibilityPanel land={land} />
                </Card>
              )}

              {activeSection === 'legal' && (
                <Card>
                  <CardHeader title="Legal Due Diligence" />
                  <DueDiligencePanel land={land} />
                </Card>
              )}

              {activeSection === 'acquisition' && (
                <>
                  <Card>
                    <CardHeader title="Negotiation" />
                    <NegotiationPanel land={land} />
                  </Card>
                  {/* a JV is signed on its own tab, where the split lives */}
                  {isJv ? (
                    <Card>
                      <CardHeader title="JV signing" />
                      <p className="text-sm text-ink-muted">
                        A joint venture is closed by signing, recorded on the{' '}
                        <button
                          type="button"
                          onClick={() => setTab('jv')}
                          className="font-medium text-admin-700 hover:underline"
                        >
                          Joint Venture tab
                        </button>{' '}
                        with the share split.
                      </p>
                    </Card>
                  ) : (
                    <LandClosingCard land={land} />
                  )}
                  <p className="rounded-xl border border-hairline bg-white px-4 py-3 text-sm text-ink-muted">
                    Budget, deal amount and payments for this land are on the{' '}
                    <button
                      type="button"
                      onClick={() => setTab('cost')}
                      className="font-medium text-admin-700 hover:underline"
                    >
                      Land Cost tab
                    </button>
                    .
                  </p>
                </>
              )}

            </div>
          )}

          {tab === 'development' && held && (
            <Card>
              <CardHeader title="Land Development" />
              <DevelopmentPanel land={land} />
            </Card>
          )}

          {tab === 'papers' && owned && <LandPapersPanel land={land} readOnly={!mayEdit} />}

          {tab === 'cost' && <LandCostPanel land={land} />}

          {tab === 'documents' && (
            <Card>
              <CardHeader title="Documents" />
              <DocumentsPanel entityType="land" entityId={land.id} />
            </Card>
          )}
        </div>

        <aside className="min-w-0 space-y-5 lg:order-2">
          {owned ? (
            <OwnedLandCard
              land={land}
              onOpen={(t) => {
                setTab(t === 'papers' ? 'papers' : 'development');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          ) : (
            <LandProgressCard land={land} onOpen={openSection} />
          )}

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

      {deciding && (
        <LandEventDialog land={land} target={deciding} onClose={() => setDeciding(null)} />
      )}
      {correcting && (
        <ViewOnlyArea readOnly={false}>
          <CorrectStatusDialog land={land} inProject={inProject} onClose={() => setCorrecting(false)} />
        </ViewOnlyArea>
      )}
      {editingAmounts && <OwnerAmountsDialog land={land} onClose={() => setEditingAmounts(false)} />}

      <ConfirmDialog
        open={resuming}
        title="Resume this land"
        subtitle={land.code}
        tone="default"
        icon={PlayCircle}
        confirmLabel="Resume"
        message="The land goes back to the status it was in before it was put on hold, and its records are re-checked in case work has moved on since."
        onCancel={() => setResuming(false)}
        onConfirm={async () => {
          await landPipelineRepository.resumeFromHold(
            land.id,
            { event_date: todayLocal(), remarks: null },
            null,
          );
          setResuming(false);
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${land.code}`}
        subtitle={land.name}
        confirmLabel="Delete land"
        message={
          deleteBlocked ??
          'This deletes the land along with its owner links, JV terms, pipeline history and uploaded documents. It cannot be undone.'
        }
        disabled={Boolean(deleteBlocked)}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await landRepository.removeCascade(land.id);
          router.push('/admin/lands');
        }}
      />
    </ViewOnlyArea>
  );
}
