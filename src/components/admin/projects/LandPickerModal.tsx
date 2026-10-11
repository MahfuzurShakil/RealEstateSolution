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
import { formatBdt } from '@/lib/utils/format';
import { QuickLandModal } from './QuickLandModal';

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
        onClose={() => setAdding(null)}
        onCreated={(land) => {
          setAdding(null);
          setChosen(land);
        }}
      />
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
          <Button variant="outline" onClick={onClose}>
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
    ['Mouza / Dag / Khatian', [land.mouza, land.dag_number, land.khatian_number].map((v) => v || '—').join(' / ')],
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
