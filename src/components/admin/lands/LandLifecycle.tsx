'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowDownUp,
  ArrowLeftRight,
  Banknote,
  Bot,
  Calculator,
  ChevronDown,
  FileImage,
  FileText,
  GitBranch,
  History,
  HardHat,
  MapPin,
  Plus,
  Scale,
  Wrench,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { DocumentViewer } from '@/components/admin/documents/DocumentsPanel';
import { SiteVisitDetails, VisitDialog } from '@/components/admin/lands/SiteVisit';
import { FeasibilityStudyDetails, StudyDialog } from '@/components/admin/lands/FeasibilityStudy';
import {
  PARTY_LABEL,
  RoundDialog,
  STATUS_META as ROUND_STATUS_META,
} from '@/components/admin/lands/NegotiationPanel';
import { STATUS_META as DD_STATUS_META } from '@/components/admin/lands/DueDiligencePanel';
import { useMockSession } from '@/lib/auth/mock-session';
import type { DocumentRecord } from '@/lib/db/types';
import { LAND_STATUS_META, isTerminalStatus, type LandWorkArea } from '@/lib/domain/land';
import {
  documentRepository,
  landLifecycleRepository,
  type LandWithRelations,
  type LifecycleEntry,
  type LifecycleKind,
} from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt, formatDate } from '@/lib/utils/format';

const KIND_META: Record<LifecycleKind, { label: string; icon: typeof MapPin; tint: string }> = {
  status: { label: 'Status', icon: GitBranch, tint: 'bg-admin-100 text-admin-700' },
  visit: { label: 'Site visits', icon: MapPin, tint: 'bg-sky-100 text-sky-700' },
  study: { label: 'Feasibility', icon: Calculator, tint: 'bg-violet-100 text-violet-700' },
  round: { label: 'Offers', icon: ArrowLeftRight, tint: 'bg-amber-100 text-amber-700' },
  dd: { label: 'Legal', icon: Scale, tint: 'bg-slate-200 text-slate-700' },
  development: { label: 'Development', icon: HardHat, tint: 'bg-orange-100 text-orange-700' },
  payment: { label: 'Payments', icon: Banknote, tint: 'bg-emerald-100 text-emerald-700' },
};

const FILTERS: Array<LifecycleKind | 'all'> = [
  'all',
  'status',
  'visit',
  'study',
  'round',
  'dd',
  'development',
  'payment',
];

/**
 * Lifecycle — one date-ordered feed of everything that has happened to a land
 * (L7 part 4, LAND-UX-REVIEW.md section 5).
 *
 * It is the pipeline the client's feedback described: a timeline where some
 * steps repeat. Status changes, site visits, feasibility versions, offers, due
 * diligence milestones, development reports and payments are all entries, each
 * opening onto the full record and the actions that belong to it. Recording a
 * visit, a study or a round happens here, at the top of the story it adds to —
 * and the status entry the pipeline writes in response lands in the same feed a
 * moment later, saying what moved it.
 */
export function LandLifecycle({
  land,
  onOpen,
}: {
  land: LandWithRelations;
  onOpen: (area: LandWorkArea) => void;
}) {
  const { userId } = useMockSession();
  const entries = useLiveQuery(() => landLifecycleRepository.feedForLand(land.id), [land.id]);
  const documents = useLiveQuery(() => documentRepository.listForEntity('land', land.id), [land.id]);

  const [filter, setFilter] = useState<LifecycleKind | 'all'>('all');
  const [oldestFirst, setOldestFirst] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [recording, setRecording] = useState<'visit' | 'study' | 'round' | null>(null);
  const [viewing, setViewing] = useState<DocumentRecord | null>(null);

  // documents attached at a manual status step, keyed by the step
  const byEvent = useMemo(() => {
    const map = new Map<string, DocumentRecord[]>();
    for (const doc of documents ?? []) {
      if (!doc.status_event_id) continue;
      map.set(doc.status_event_id, [...(map.get(doc.status_event_id) ?? []), doc]);
    }
    return map;
  }, [documents]);

  if (entries === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;

  const counts = entries.reduce<Partial<Record<LifecycleKind, number>>>((acc, e) => {
    acc[e.kind] = (acc[e.kind] ?? 0) + 1;
    return acc;
  }, {});
  const shown = entries.filter((e) => filter === 'all' || e.kind === filter);
  if (oldestFirst) shown.reverse();

  const currentStudy = entries.find((e) => e.kind === 'study' && e.isCurrent);
  // a new round defaults its terms from the highest-numbered one, not the newest-dated
  const latestRound = entries.reduce<LifecycleEntry | undefined>(
    (best, e) =>
      e.kind === 'round' && (best?.kind !== 'round' || e.round.round_no > best.round.round_no)
        ? e
        : best,
    undefined,
  );
  const closed = isTerminalStatus(land.status);

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <>
      {/* the three pieces of work that move a land sit at the top of its story */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setRecording('visit')}>
          <Plus className="size-4" /> Record a visit
        </Button>
        <Button size="sm" variant="outline" onClick={() => setRecording('study')}>
          <Plus className="size-4" /> {currentStudy ? 'New feasibility version' : 'Add a study'}
        </Button>
        {!closed && (
          <Button size="sm" variant="outline" onClick={() => setRecording('round')}>
            <Plus className="size-4" /> Record a round
          </Button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-hairline pt-4">
        {FILTERS.filter((f) => f === 'all' || counts[f]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              filter === f
                ? 'border-admin-500 bg-admin-500 text-white'
                : 'border-hairline bg-white text-ink-muted hover:border-admin-300 hover:text-admin-700',
            )}
          >
            {f === 'all' ? `All · ${entries.length}` : `${KIND_META[f].label} · ${counts[f]}`}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setOldestFirst((v) => !v)}
          className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-admin-700"
        >
          <ArrowDownUp className="size-3.5" />
          {oldestFirst ? 'Oldest first' : 'Newest first'}
        </button>
      </div>

      {shown.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={History}
            title="Nothing has happened to this land yet"
            description="Record the first site visit — the land moves to Under Review when you do, and everything that follows is told here in date order."
          />
        </div>
      ) : (
        <ol className="relative mt-4 space-y-2.5 pl-10">
          <span className="absolute bottom-4 left-[15px] top-4 w-px bg-hairline" aria-hidden />
          {shown.map((entry) => {
            const meta = KIND_META[entry.kind];
            const Icon =
              entry.kind === 'status' && entry.event.source === 'automatic'
                ? Bot
                : entry.kind === 'status' && entry.event.source === 'correction'
                  ? Wrench
                  : meta.icon;
            const isOpen = open.has(entry.key);
            const { title, summary } = describe(entry);
            return (
              <li key={entry.key} className="relative">
                <span
                  className={cn(
                    'absolute -left-10 top-3 grid size-8 place-items-center rounded-full ring-4 ring-white',
                    meta.tint,
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <div
                  className={cn(
                    'rounded-xl border bg-white transition-colors',
                    isOpen ? 'border-admin-200' : 'border-hairline',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggle(entry.key)}
                    aria-expanded={isOpen}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">{title}</div>
                      {/* an open status entry shows its remark in full below, so not twice */}
                      {summary && !(isOpen && entry.kind === 'status') && (
                        <p className="mt-0.5 text-xs text-ink-muted">{summary}</p>
                      )}
                    </div>
                    <span className="shrink-0 pt-0.5 text-xs font-medium text-ink">
                      {formatDate(entry.date)}
                    </span>
                    <ChevronDown
                      className={cn(
                        'mt-0.5 size-4 shrink-0 text-ink-muted transition-transform',
                        isOpen && 'rotate-180',
                      )}
                    />
                  </button>
                  {isOpen && (
                    <div className="border-t border-hairline px-4 py-3">
                      <EntryBody
                        entry={entry}
                        land={land}
                        onOpen={onOpen}
                        attachments={entry.kind === 'status' ? (byEvent.get(entry.event.id) ?? []) : []}
                        onView={setViewing}
                      />
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {recording === 'visit' && <VisitDialog land={land} onClose={() => setRecording(null)} />}
      {recording === 'study' && (
        <StudyDialog
          land={land}
          previous={currentStudy?.kind === 'study' ? currentStudy.study : undefined}
          onClose={() => setRecording(null)}
        />
      )}
      {recording === 'round' && (
        <RoundDialog
          land={land}
          previous={latestRound?.kind === 'round' ? latestRound.round : undefined}
          userId={userId}
          onClose={() => setRecording(null)}
        />
      )}

      {viewing && (
        <DocumentViewer
          doc={viewing}
          documents={byEvent.get(viewing.status_event_id ?? '') ?? [viewing]}
          onSelect={setViewing}
          onClose={() => setViewing(null)}
        />
      )}
    </>
  );
}

/** The collapsed line of an entry: what it is, and the one fact worth seeing. */
function describe(entry: LifecycleEntry): { title: ReactNode; summary: string | null } {
  switch (entry.kind) {
    case 'status': {
      const { event } = entry;
      const meta = LAND_STATUS_META[event.to_status];
      const how =
        event.source === 'automatic' ? 'Automatic' : event.source === 'correction' ? 'Corrected' : null;
      return {
        title: (
          <>
            <Badge tone={meta.tone}>{meta.label}</Badge>
            <span className="text-xs text-ink-muted">
              from {LAND_STATUS_META[event.from_status].label}
            </span>
            {how && (
              <Badge tone={event.source === 'correction' ? 'amber' : 'neutral'}>{how}</Badge>
            )}
          </>
        ),
        summary: event.remarks ?? null,
      };
    }
    case 'visit': {
      const v = entry.visit;
      const facts = [
        v.visited_by ? `Led by ${v.visited_by}` : null,
        v.is_lowland ? `lowland${v.filling_required_ft ? `, ${v.filling_required_ft} ft fill` : ''}` : null,
        v.road_width_ft != null ? `${v.road_width_ft} ft road` : null,
      ].filter(Boolean);
      return {
        title: <span className="text-sm font-medium text-ink">Site visit</span>,
        summary: facts.join(' · ') || null,
      };
    }
    case 'study': {
      const s = entry.study;
      const cost = Number(s.est_acquisition_cost) + Number(s.est_development_cost) + Number(s.est_other_cost);
      const pct = s.expected_revenue > 0 ? ((s.expected_revenue - cost) / s.expected_revenue) * 100 : null;
      const verb = { draft: 'drafted', submitted: 'submitted', approved: 'approved', rejected: 'rejected' }[
        s.status
      ];
      return {
        title: (
          <span className="text-sm font-medium text-ink">
            Feasibility version {s.version_no} {verb}
          </span>
        ),
        summary: `Recommends ${s.recommendation}${pct != null ? ` · ${pct.toFixed(1)}% margin` : ''}${
          entry.isCurrent ? '' : ' · superseded'
        }`,
      };
    }
    case 'round': {
      const r = entry.round;
      return {
        title: (
          <>
            <span className="text-sm font-medium text-ink">
              Round {r.round_no} · {PARTY_LABEL[r.party]}
            </span>
            <Badge tone={ROUND_STATUS_META[r.status].tone}>{ROUND_STATUS_META[r.status].label}</Badge>
          </>
        ),
        summary: [formatBdt(r.amount), entry.ownerName, r.broker_name && `via ${r.broker_name}`]
          .filter(Boolean)
          .join(' · '),
      };
    }
    case 'dd': {
      const tally = new Map<string, number>();
      for (const row of entry.items) {
        const label = DD_STATUS_META[row.status].label.toLowerCase();
        tally.set(label, (tally.get(label) ?? 0) + 1);
      }
      const n = entry.items.length;
      return {
        title: (
          <span className="text-sm font-medium text-ink">
            Due diligence · {n} {n === 1 ? 'check' : 'checks'} updated
          </span>
        ),
        summary: [...tally].map(([label, count]) => `${count} ${label}`).join(' · '),
      };
    }
    case 'development': {
      const { progress, activity } = entry;
      return {
        title: (
          <span className="text-sm font-medium text-ink">
            {activity.activity_type} · {progress.pct_complete}% complete
          </span>
        ),
        summary: [
          progress.qty_done != null ? `${progress.qty_done} ${activity.unit ?? ''}`.trim() : null,
          progress.amount_incurred != null ? `${formatBdt(progress.amount_incurred)} spent` : null,
        ]
          .filter(Boolean)
          .join(' · ') || null,
      };
    }
    case 'payment': {
      const e = entry.expense;
      const what = e.cost_category === 'land_payment' ? 'Land payment' : 'Land cost';
      return {
        title: (
          <span className="text-sm font-medium text-ink">
            {what} · <span className="tabular-nums">{formatBdt(e.amount)}</span>
          </span>
        ),
        summary: [entry.ownerName ? `to ${entry.ownerName}` : `to ${e.paid_to}`, e.cost_reason, e.code]
          .filter(Boolean)
          .join(' · '),
      };
    }
  }
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="whitespace-pre-wrap text-sm text-ink">{value}</dd>
    </div>
  );
}

function OpenLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 text-xs font-medium text-admin-700 hover:underline"
    >
      {label} →
    </button>
  );
}

/** What an entry shows when it is opened — the record, and what can be done to it. */
function EntryBody({
  entry,
  land,
  onOpen,
  attachments,
  onView,
}: {
  entry: LifecycleEntry;
  land: LandWithRelations;
  onOpen: (area: LandWorkArea) => void;
  attachments: DocumentRecord[];
  onView: (doc: DocumentRecord) => void;
}) {
  switch (entry.kind) {
    case 'status': {
      const { event } = entry;
      const has = event.performed_by || event.amount != null || event.reference_no;
      return (
        <>
          {event.source === 'automatic' && (
            <p className="mb-3 text-xs text-ink-muted">
              Moved by the system when the work it names was recorded — nobody confirmed this by hand.
            </p>
          )}
          {event.source === 'correction' && (
            <p className="mb-3 text-xs text-amber-800">
              A correction. It put the land where it actually was and skipped the pipeline gates; the
              reason is the remark below.
            </p>
          )}
          {has && (
            <dl className="grid gap-3 sm:grid-cols-3">
              {event.performed_by && <Detail label="By" value={event.performed_by} />}
              {event.amount != null && <Detail label="Amount" value={formatBdt(event.amount)} />}
              {event.reference_no && <Detail label="Reference" value={event.reference_no} />}
            </dl>
          )}
          {event.remarks && (
            <p className={cn('whitespace-pre-wrap text-sm text-ink-muted', has && 'mt-3 border-t border-hairline pt-3')}>
              {event.remarks}
            </p>
          )}
          {attachments.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5 border-t border-hairline pt-3">
              {attachments.map((doc) => (
                <li key={doc.id}>
                  <button
                    type="button"
                    onClick={() => onView(doc)}
                    className="flex max-w-[16rem] items-center gap-1.5 rounded-lg border border-hairline bg-white px-2 py-1 text-xs text-ink-muted transition-colors hover:border-admin-300 hover:bg-admin-50/50 hover:text-ink"
                  >
                    {doc.mime_type?.startsWith('image/') ? (
                      <FileImage className="size-3.5 shrink-0 text-admin-600" />
                    ) : (
                      <FileText className="size-3.5 shrink-0 text-admin-600" />
                    )}
                    <span className="truncate">{doc.file_name ?? doc.file_url}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-slate-400">Logged {formatDate(event.created_at)}</p>
        </>
      );
    }

    case 'visit':
      return <SiteVisitDetails land={land} visit={entry.visit} />;

    case 'study':
      return <FeasibilityStudyDetails land={land} study={entry.study} isCurrent={entry.isCurrent} />;

    case 'round': {
      const r = entry.round;
      return (
        <>
          <dl className="grid gap-3 sm:grid-cols-2">
            <Detail label="Amount" value={<span className="tabular-nums">{formatBdt(r.amount)}</span>} />
            {entry.ownerName && <Detail label="With" value={entry.ownerName} />}
            {r.terms && <Detail label="Payment terms" value={r.terms} />}
            {r.conditions && <Detail label="Conditions" value={r.conditions} />}
            {r.broker_name && (
              <Detail
                label="Broker"
                value={`${r.broker_name}${r.broker_commission != null ? ` · ${formatBdt(r.broker_commission)} commission` : ''}`}
              />
            )}
            {r.remarks && <Detail label="Remarks" value={r.remarks} />}
          </dl>
          {/* accepting is a commercial decision and stays beside the whole ladder */}
          <OpenLink
            label={r.status === 'open' ? 'Accept or counter in Commercials' : 'See the negotiation ladder'}
            onClick={() => onOpen('negotiation')}
          />
        </>
      );
    }

    case 'dd':
      return (
        <>
          <ul className="space-y-2.5">
            {entry.items.map((row) => (
              <li key={row.id} className="flex flex-wrap items-start gap-2">
                <Badge tone={DD_STATUS_META[row.status].tone}>{DD_STATUS_META[row.status].label}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">
                    {row.item?.label ?? 'Checklist item'}
                    {row.is_mandatory && <span className="ml-1.5 text-xs text-ink-muted">mandatory</span>}
                  </p>
                  {(row.waiver_reason || row.finding) && (
                    <p className="mt-0.5 whitespace-pre-wrap text-xs text-ink-muted">
                      {row.status === 'waived' ? `Waived: ${row.waiver_reason}` : row.finding}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <OpenLink label="Open the checklist in Legal" onClick={() => onOpen('dd')} />
        </>
      );

    case 'development': {
      const { progress, activity } = entry;
      return (
        <>
          <dl className="grid gap-3 sm:grid-cols-3">
            <Detail label="Complete" value={`${progress.pct_complete}%`} />
            {progress.qty_done != null && (
              <Detail
                label="Done"
                value={`${progress.qty_done}${activity.planned_qty != null ? ` of ${activity.planned_qty}` : ''} ${activity.unit ?? ''}`}
              />
            )}
            {progress.amount_incurred != null && (
              <Detail
                label="Spent so far"
                value={`${formatBdt(progress.amount_incurred)} of ${formatBdt(activity.budget_amount)} budget`}
              />
            )}
          </dl>
          {progress.remarks && (
            <p className="mt-3 whitespace-pre-wrap border-t border-hairline pt-3 text-sm text-ink-muted">
              {progress.remarks}
            </p>
          )}
          <OpenLink label="Open development" onClick={() => onOpen('development')} />
        </>
      );
    }

    case 'payment': {
      const e = entry.expense;
      return (
        <>
          <dl className="grid gap-3 sm:grid-cols-2">
            <Detail label="Paid to" value={entry.ownerName ?? e.paid_to} />
            <Detail label="For" value={e.cost_reason} />
            {e.reference_no && <Detail label="Reference" value={e.reference_no} />}
            {e.notes && <Detail label="Notes" value={e.notes} />}
          </dl>
          <div className="flex flex-wrap gap-4">
            <OpenLink label="See the payment plan" onClick={() => onOpen('payments')} />
            <Link
              href={`/admin/expenses?land=${land.id}`}
              className="mt-3 text-xs font-medium text-admin-700 hover:underline"
            >
              Open {e.code} in the cost ledger →
            </Link>
          </div>
        </>
      );
    }
  }
}
