'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Check, ClipboardList, KeyRound, MapPin, Search } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { Land, LandEntryMode } from '@/lib/db/types';
import {
  ACQUISITION_TYPE_LABEL,
  LAND_ENTRY_MODE_LABEL,
  LAND_SIZE_UNIT_LABEL,
  LAND_STATUS_META,
  landEntryMode,
  landStatusLabel,
} from '@/lib/domain/land';
import {
  landAcquisitionCostRepository,
  landProjectMappingRepository,
  landRepository,
  projectRepository,
} from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt, formatDate } from '@/lib/utils/format';
import { QuickLandModal, createQuickLand, type QuickLandDraft } from './QuickLandModal';

/**
 * Choosing the land a project stands on (client walkthrough 2026-10-10).
 *
 * Two steps: pick from the list (or add a new land), then confirm against the
 * land's key facts. The project form then shows only the confirmed land, read
 * only. Land already belonging to another project is shown but cannot be
 * picked: one land, one project (decision D3).
 */
export function LandPickerModal({
  open,
  projectId,
  exclude,
  onClose,
  onConfirm,
}: {
  open: boolean;
  projectId?: string;
  /** lands already on this form */
  exclude: string[];
  onClose: () => void;
  onConfirm: (land: Land) => void;
}) {
  if (!open) return null;
  return <Picker projectId={projectId} exclude={exclude} onClose={onClose} onConfirm={onConfirm} />;
}

function Picker({
  projectId,
  exclude,
  onClose,
  onConfirm,
}: {
  projectId?: string;
  exclude: string[];
  onClose: () => void;
  onConfirm: (land: Land) => void;
}) {
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<Land | null>(null);
  const [adding, setAdding] = useState<LandEntryMode | null>(null);
  /* a new land under review: not saved until it is confirmed (2026-10-17) */
  const [draft, setDraft] = useState<QuickLandDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const data = useLiveQuery(async () => {
    const [lands, mappings, projects] = await Promise.all([
      landRepository.getAll(),
      landProjectMappingRepository.getAll(),
      projectRepository.getAll(),
    ]);
    const codeOf = new Map(projects.map((p) => [p.id, p.code]));
    const takenBy = new Map<string, string>();
    for (const m of mappings) {
      if (m.project_id !== projectId) takenBy.set(m.land_id, codeOf.get(m.project_id) ?? 'another project');
    }
    return {
      lands: lands
        .filter((l) => l.status !== 'rejected' && l.status !== 'disposed' && !exclude.includes(l.id))
        .sort((a, b) => a.code.localeCompare(b.code)),
      takenBy,
    };
  }, [projectId, exclude.join(',')]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = data?.lands ?? [];
    if (!q) return list;
    return list.filter((l) =>
      [l.code, l.name, l.location_area, l.location_district, l.mouza, l.dag_number]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [data, query]);

  if (adding) {
    return (
      <QuickLandModal
        open
        initialMode={adding}
        initialDraft={draft ?? undefined}
        onClose={() => {
          setAdding(null);
          setDraft(null);
        }}
        onReview={(d) => {
          setAdding(null);
          setDraft(d);
        }}
      />
    );
  }

  async function confirmDraft() {
    if (!draft) return;
    setSaving(true);
    setSaveError('');
    try {
      onConfirm(await createQuickLand(draft));
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'The land could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  if (draft) {
    return (
      <Modal
        open
        size="lg"
        title="Confirm the land"
        subtitle="Nothing is saved yet. Go back to change anything."
        icon={MapPin}
        onClose={onClose}
        footer={
          <>
            <Button variant="outline" onClick={() => setAdding(draft.mode)} disabled={saving}>
              <ArrowLeft className="size-4" /> Back to edit
            </Button>
            <Button onClick={confirmDraft} disabled={saving}>
              <Check className="size-4" /> {saving ? 'Saving…' : 'Confirm this land'}
            </Button>
          </>
        }
      >
        <DraftFacts draft={draft} />
        {saveError && <p className="mt-2 text-sm text-red-600">{saveError}</p>}
      </Modal>
    );
  }

  return (
    <Modal
      open
      size="lg"
      title={chosen ? 'Confirm the land' : 'Select the land'}
      subtitle={chosen ? 'Check these facts before linking it to the project' : 'A land can belong to one project only'}
      icon={MapPin}
      onClose={onClose}
      footer={
        chosen ? (
          <>
            <Button variant="outline" onClick={() => setChosen(null)}>
              <ArrowLeft className="size-4" /> Pick another
            </Button>
            <Button onClick={() => onConfirm(chosen)}>
              <Check className="size-4" /> Confirm this land
            </Button>
          </>
        ) : (
          <Button variant="outline" onClick={onClose} viewSafe>
            Cancel
          </Button>
        )
      }
    >
      {chosen ? (
        <LandFacts land={chosen} />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search code, name, area, mouza or dag"
                className="h-10 w-full rounded-lg border border-hairline bg-white pl-9 pr-3 text-sm outline-none focus:border-admin-400"
                autoFocus
              />
            </div>
            <Button variant="outline" onClick={() => setAdding('owned')}>
              <KeyRound className="size-4" /> New owned land
            </Button>
            <Button variant="outline" onClick={() => setAdding('pipeline')}>
              <ClipboardList className="size-4" /> New land to acquire
            </Button>
          </div>
          <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
            {rows.length === 0 && (
              <li className="rounded-xl border border-dashed border-hairline p-4 text-sm text-ink-muted">
                No land matches. Add it with the buttons above.
              </li>
            )}
            {rows.map((land) => {
              const taken = data?.takenBy.get(land.id);
              return (
                <li key={land.id}>
                  <button
                    type="button"
                    disabled={Boolean(taken)}
                    onClick={() => setChosen(land)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors',
                      taken
                        ? 'cursor-not-allowed border-hairline bg-slate-50 opacity-60'
                        : 'border-hairline bg-white hover:border-admin-300 hover:bg-admin-50/50',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium text-ink">{land.name}</span>
                        <Badge tone={LAND_STATUS_META[land.status].tone}>
                          {landStatusLabel(land.status, land.acquisition_type)}
                        </Badge>
                      </p>
                      <p className="text-xs text-ink-muted">
                        {land.code} · {land.land_size} {LAND_SIZE_UNIT_LABEL[land.land_size_unit]} ·{' '}
                        {[land.location_area, land.location_district].filter(Boolean).join(', ')} ·{' '}
                        {ACQUISITION_TYPE_LABEL[land.acquisition_type]}
                      </p>
                    </div>
                    {taken && <span className="shrink-0 text-xs font-medium text-amber-700">In {taken}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Modal>
  );
}

/** The facts somebody checks before putting a project on a land. */
export function LandFacts({ land }: { land: Land }) {
  const sheet = useLiveQuery(() => landAcquisitionCostRepository.sheetForLand(land.id), [land.id]);
  const facts: [string, string][] = [
    ['Land', `${land.code} · ${land.name}`],
    ['Location', [land.location_area, land.location_upazila, land.location_district].filter(Boolean).join(', ')],
    ['Size', `${land.land_size} ${LAND_SIZE_UNIT_LABEL[land.land_size_unit]}`],
    // only when something is recorded: a quick-added land has none yet (2026-10-17)
    ...((land.mouza || land.dag_number || land.khatian_number
      ? [['Mouza / Dag / Khatian', [land.mouza, land.dag_number, land.khatian_number].map((v) => v || '—').join(' / ')]]
      : []) as [string, string][]),
    ['Acquired how', `${ACQUISITION_TYPE_LABEL[land.acquisition_type]} · ${LAND_ENTRY_MODE_LABEL[landEntryMode(land)]}`],
    ['Status', landStatusLabel(land.status, land.acquisition_type)],
    ...landMoney(land, sheet),
  ];
  return (
    <dl className="divide-y divide-hairline rounded-xl border border-hairline bg-white">
      {facts.map(([k, v]) => (
        <div key={k} className="flex items-start justify-between gap-4 px-4 py-2.5">
          <dt className="text-sm text-ink-muted">{k}</dt>
          <dd className="text-right text-sm font-medium text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The same facts for a land that is not saved yet. */
function DraftFacts({ draft }: { draft: QuickLandDraft }) {
  const { form } = draft;
  const owned = draft.mode === 'owned';
  const isJv = form.acquisition_type === 'joint_venture';
  const price = Number(form.price_paid) || 0;
  const fees = Number(form.registration_paid) || 0;
  const other = draft.other_costs.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const facts: [string, string][] = [
    ['Land', `${form.name.trim()} (code on save)`],
    ['Location', [form.location_area, form.location_district, form.location_division].filter(Boolean).join(', ')],
    ['Size', `${form.land_size} ${LAND_SIZE_UNIT_LABEL[form.land_size_unit]}`],
    ['Acquired how', `${ACQUISITION_TYPE_LABEL[form.acquisition_type]} · ${LAND_ENTRY_MODE_LABEL[draft.mode]}`],
    ...((owned
      ? [
          [isJv ? 'JV signed on' : 'Owned since', formatDate(form.owned_on)],
          ...(isJv ? [['Developer share', `${form.developer_share_pct}%`]] : []),
          [
            isJv ? 'Signing money paid' : 'Land price paid',
            form.acquisition_type === 'inherited' && price === 0 ? 'Inherited, no price paid' : formatBdt(price),
          ],
          ['Registration & fees', formatBdt(fees)],
          ...draft.other_costs.map((r) => [r.label.trim(), formatBdt(Number(r.amount))]),
          ['Total paid so far', formatBdt(price + fees + other)],
        ]
      : form.acquisition_type === 'direct_purchase'
        ? [['Asking price', formatBdt(Number(form.asking_price) || 0)]]
        : []) as [string, string][]),
  ];
  return (
    <dl className="divide-y divide-hairline rounded-xl border border-hairline bg-white">
      {facts.map(([k, v], i) => (
        <div key={`${k}-${i}`} className="flex items-start justify-between gap-4 px-4 py-2.5">
          <dt className="text-sm text-ink-muted">{k}</dt>
          <dd className="text-right text-sm font-medium text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The land's money in plain words (client feedback 2026-10-11): what the land
 * itself costs and on what basis, everything paid so far, and what is still
 * to pay. "Estimated / spent" mixed fees, estimates and payments into two
 * numbers nobody could read.
 */
function landMoney(
  land: Land,
  sheet: Awaited<ReturnType<typeof landAcquisitionCostRepository.sheetForLand>> | undefined,
): [string, string][] {
  if (!sheet) return [['Land cost', '…']];
  const price = sheet.lines.find((l) => l.cost_head === 'land_price');
  const isJv = land.acquisition_type === 'joint_venture';
  const basis = price?.historic
    ? 'paid'
    : Number(land.final_agreed_amount)
      ? 'agreed'
      : land.acquisition_type === 'direct_purchase'
        ? 'asking'
        : '';
  const priceText =
    land.acquisition_type === 'inherited' && !(price && price.estimated > 0)
      ? 'Inherited, no price paid'
      : price && price.estimated > 0
        ? `${formatBdt(price.estimated)}${basis ? ` (${basis})` : ''}`
        : 'Not recorded';
  const total = Math.max(sheet.landTotal.estimated, sheet.landTotal.actual);
  const toPay = Math.max(0, total - sheet.landTotal.actual);
  return [
    [isJv ? 'Signing money' : 'Land price', priceText],
    ['Paid so far', `${formatBdt(sheet.landTotal.actual)} (price, fees and development)`],
    ['Still to pay', toPay > 0 ? formatBdt(toPay) : 'Nothing'],
  ];
}
