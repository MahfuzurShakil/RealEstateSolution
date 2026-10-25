'use client';

import { useState } from 'react';
import { BedDouble, Bath, Compass, CornerDownRight, MessageCircle, PhoneCall, Ruler, Signpost, Sun } from 'lucide-react';
import { PUBLIC_UNIT_STATUS_LABEL, formatPublicPrice, type PublicUnitStatus } from '@/lib/domain/public-portal';
import type { PublicContainer, PublicProjectDetail, PublicUnit } from '@/lib/repositories/public/project.public.repository';
import { cn } from '@/lib/utils/cn';
import { Taka } from '../ProjectCard';

/*
 * v2.0 §3.6–3.7 — the building (or the plot layout, or the share register)
 * as a buyer sees it: every item that exists, coloured by whether it can still
 * be booked. Only available items carry a price, and clicking one opens its
 * details with a call and a WhatsApp message that already names it.
 */

const TONE: Record<PublicUnitStatus, string> = {
  available: 'border-site-primary/40 bg-site-primary-soft text-site-primary-dark hover:bg-site-primary hover:text-white',
  booked: 'border-amber-200 bg-amber-50 text-amber-700',
  sold: 'border-slate-200 bg-slate-100 text-slate-400',
};

const DOT: Record<PublicUnitStatus, string> = {
  available: 'bg-site-primary',
  booked: 'bg-amber-400',
  sold: 'bg-slate-300',
};

function floorName(floor: number): string {
  if (floor < 0) return `Basement ${-floor}`;
  if (floor === 0) return 'Ground';
  return `Floor ${floor}`;
}

function UnitChip({ unit, active, onPick }: { unit: PublicUnit; active: boolean; onPick: () => void }) {
  const open = unit.public_status === 'available';
  return (
    <button
      type="button"
      disabled={!open}
      onClick={onPick}
      title={`${unit.code} · ${PUBLIC_UNIT_STATUS_LABEL[unit.public_status]}`}
      className={cn(
        'min-w-[4.5rem] rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-default',
        TONE[unit.public_status],
        active && 'bg-site-primary text-white ring-2 ring-site-primary ring-offset-2',
      )}
    >
      {unit.code}
    </button>
  );
}

function Legend({ units }: { units: PublicUnit[] }) {
  const count = (s: PublicUnitStatus) => units.filter((u) => u.public_status === s).length;
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
      {(['available', 'booked', 'sold'] as const).map((s) => (
        <span key={s} className="flex items-center gap-2">
          <span className={cn('size-3 rounded-full', DOT[s])} /> {PUBLIC_UNIT_STATUS_LABEL[s]}
          <span className="text-site-muted">({count(s)})</span>
        </span>
      ))}
    </div>
  );
}

function UnitDetails({
  unit,
  project,
  itemLabel,
  whatsapp,
  tel,
}: {
  unit: PublicUnit | null;
  project: PublicProjectDetail;
  itemLabel: string;
  whatsapp: (message: string) => string | null;
  tel: string | null;
}) {
  if (!unit) {
    return (
      <div className="grid h-full min-h-56 place-items-center rounded-2xl border border-dashed border-site-line p-6 text-center text-site-muted">
        <p>
          Pick a green {itemLabel.toLowerCase()} to see its size, facing and price.
        </p>
      </div>
    );
  }
  const facts: { icon: typeof Ruler; label: string }[] = [
    { icon: Ruler, label: unit.size_label },
    ...(unit.bedroom_count != null ? [{ icon: BedDouble, label: `${unit.bedroom_count} ${unit.bedroom_count === 1 ? 'bed' : 'beds'}` }] : []),
    ...(unit.bathroom_count != null ? [{ icon: Bath, label: `${unit.bathroom_count} ${unit.bathroom_count === 1 ? 'bath' : 'baths'}` }] : []),
    ...(unit.balcony_count != null ? [{ icon: Sun, label: `${unit.balcony_count} ${unit.balcony_count === 1 ? 'balcony' : 'balconies'}` }] : []),
    ...(unit.facing ? [{ icon: Compass, label: `${unit.facing} facing` }] : []),
    ...(unit.road_width_ft ? [{ icon: Signpost, label: `${unit.road_width_ft} ft road` }] : []),
    ...(unit.is_corner ? [{ icon: CornerDownRight, label: 'Corner plot' }] : []),
  ];
  const message = `Hi, I'm interested in ${itemLabel} ${unit.code} at ${project.name} (${project.code}).`;
  const wa = whatsapp(message);

  return (
    <div className="rounded-2xl bg-site-night p-6 text-white">
      <p className="text-sm text-white/60">
        {itemLabel} {unit.floor != null ? `· ${floorName(unit.floor)}` : ''}
      </p>
      <p className="mt-1 text-3xl font-bold">{unit.code}</p>
      {unit.unit_type && <p className="text-white/70">{unit.unit_type}</p>}
      <ul className="mt-5 grid grid-cols-2 gap-3">
        {facts.map(({ icon: Icon, label }) => (
          <li key={label} className="flex items-center gap-2 text-white/85">
            <Icon className="size-4.5 text-site-primary" /> {label}
          </li>
        ))}
      </ul>
      {unit.price != null && (
        <div className="mt-6 border-t border-white/10 pt-5">
          <p className="text-sm text-white/60">Price</p>
          <p className="text-3xl font-bold text-site-primary">
            <Taka text={formatPublicPrice(unit.price)} />
          </p>
          <p className="mt-1 text-xs text-white/50">
            {project.container_kind === 'tower'
              ? 'Parking and utility charges, if any, are in the agreement.'
              : 'Registration costs are separate and paid at the sub-registry office.'}
          </p>
        </div>
      )}
      <div className="mt-6 flex flex-col gap-2.5">
        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-full bg-site-primary px-5 py-3 font-medium text-white hover:bg-site-primary-dark"
          >
            <MessageCircle className="size-4.5" /> Ask about {unit.code}
          </a>
        )}
        {tel && (
          <a
            href={tel}
            className="flex items-center justify-center gap-2 rounded-full border border-white/25 px-5 py-3 font-medium text-white hover:bg-white/10"
          >
            <PhoneCall className="size-4.5" /> Call to book
          </a>
        )}
      </div>
    </div>
  );
}

function ContainerGrid({
  container,
  picked,
  onPick,
  byFloor,
}: {
  container: PublicContainer;
  picked: string | null;
  onPick: (u: PublicUnit) => void;
  byFloor: boolean;
}) {
  if (!byFloor) {
    return (
      <div className="flex flex-wrap gap-2">
        {container.units.map((u) => (
          <UnitChip key={u.code} unit={u} active={picked === u.code} onPick={() => onPick(u)} />
        ))}
      </div>
    );
  }
  const floors = [...new Set(container.units.map((u) => u.floor ?? 0))].sort((a, b) => b - a);
  return (
    <div className="space-y-2">
      {floors.map((f) => (
        <div key={f} className="flex items-center gap-3">
          <span className="w-20 shrink-0 text-sm text-site-muted">{floorName(f)}</span>
          <div className="flex flex-wrap gap-2">
            {container.units
              .filter((u) => (u.floor ?? 0) === f)
              .map((u) => (
                <UnitChip key={u.code} unit={u} active={picked === u.code} onPick={() => onPick(u)} />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Availability({
  project,
  whatsapp,
  tel,
}: {
  project: PublicProjectDetail;
  whatsapp: (message: string) => string | null;
  tel: string | null;
}) {
  const containers = project.containers.filter((c) => c.units.length > 0);
  const [tab, setTab] = useState(0);
  const [picked, setPicked] = useState<PublicUnit | null>(null);
  if (containers.length === 0) return null;

  const container = containers[Math.min(tab, containers.length - 1)];
  const byFloor = container.units.some((u) => u.floor != null);
  const all = containers.flatMap((c) => c.units);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="rounded-2xl border border-site-line bg-white p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {containers.length > 1 && project.container_kind !== 'none' ? (
            <div className="flex flex-wrap gap-2">
              {containers.map((c, i) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => {
                    setTab(i);
                    setPicked(null);
                  }}
                  className={cn(
                    'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                    i === tab ? 'bg-site-primary text-white' : 'bg-site-soft text-site-ink hover:text-site-primary',
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>
          ) : (
            <p className="font-medium">{project.container_kind === 'none' ? 'Share register' : container.name}</p>
          )}
          <Legend units={project.container_kind === 'none' ? all : container.units} />
        </div>
        <div className="mt-6 overflow-x-auto">
          <ContainerGrid container={container} picked={picked?.code ?? null} onPick={setPicked} byFloor={byFloor} />
        </div>
      </div>
      <div className="lg:sticky lg:top-28 lg:self-start">
        <UnitDetails
          unit={picked}
          project={project}
          itemLabel={project.item_label_singular}
          whatsapp={whatsapp}
          tel={tel}
        />
      </div>
    </div>
  );
}
