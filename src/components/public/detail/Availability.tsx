'use client';

import { useEffect, useRef, useState } from 'react';
import { BedDouble, Bath, Check, Clock3, Compass, CornerDownRight, Link2, Mail, MessageCircle, PhoneCall, Ruler, Signpost, Sun, X } from 'lucide-react';
import { PUBLIC_UNIT_STATUS_LABEL, formatPublicPrice, type PublicUnitStatus } from '@/lib/domain/public-portal';
import type { PublicContainer, PublicProjectDetail, PublicUnit } from '@/lib/repositories/public/project.public.repository';
import { cn } from '@/lib/utils/cn';
import { useEnquiry } from '../enquiry/EnquiryProvider';
import { en } from '../i18n/en';
import { Taka } from '../ProjectCard';

/*
 * v2.0 §3.6–3.7 — the building (or the plot layout, or the share register)
 * as a buyer sees it: every item that exists, coloured by whether it can still
 * be booked. Only available items carry a price, and clicking one opens its
 * details with an enquiry, a call and a WhatsApp message that already name it.
 */

// status is never colour alone (master plan §5.1): booked carries a clock, sold is struck through
const TONE: Record<PublicUnitStatus, string> = {
  available: 'border-site-primary/40 bg-site-primary-soft text-site-primary-dark hover:bg-site-primary hover:text-white',
  booked: 'border-site-booked/30 bg-site-booked-soft text-site-booked',
  sold: 'border-site-line bg-site-sold-soft text-site-sold line-through decoration-1',
};

const ICON: Record<PublicUnitStatus, typeof Check> = { available: Check, booked: Clock3, sold: X };
const DOT: Record<PublicUnitStatus, string> = {
  available: 'bg-site-primary text-white',
  booked: 'bg-site-booked-soft text-site-booked',
  sold: 'bg-site-sold-soft text-site-sold',
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
      aria-label={`${unit.code}, ${PUBLIC_UNIT_STATUS_LABEL[unit.public_status]}`}
      aria-pressed={open ? active : undefined}
      className={cn(
        'tabular inline-flex min-w-[4.5rem] items-center justify-center gap-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors duration-200 disabled:cursor-default',
        TONE[unit.public_status],
        active && 'bg-site-primary text-white ring-2 ring-site-primary ring-offset-2',
      )}
    >
      {unit.public_status === 'booked' && <Clock3 className="size-3.5" aria-hidden />}
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
          {(() => {
            const Icon = ICON[s];
            return (
              <span className={cn('grid size-5 place-items-center rounded-full', DOT[s])} aria-hidden>
                <Icon className="size-3" />
              </span>
            );
          })()}{' '}
          {PUBLIC_UNIT_STATUS_LABEL[s]}
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
  tel,
}: {
  unit: PublicUnit | null;
  project: PublicProjectDetail;
  itemLabel: string;
  tel: string | null;
}) {
  const enquiry = useEnquiry();
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
  const subject = { project: { name: project.name, code: project.code }, unit: { code: unit.code, item: itemLabel } };
  const wa = enquiry.whatsapp(subject);

  return (
    <div className="rounded-[20px] bg-site-night p-6 text-white motion-safe:animate-[fade-up_.4s_var(--ease-site-out)]">
      <p className="text-sm text-white/60">
        {itemLabel} {unit.floor != null ? `· ${floorName(unit.floor)}` : ''}
      </p>
      <div className="mt-1 flex items-center justify-between gap-3">
        <p className="tabular text-3xl font-bold">{unit.code}</p>
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(window.location.href)}
          title="Copy a link to this unit"
          aria-label={`Copy a link to ${unit.code}`}
          className="grid size-9 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
        >
          <Link2 className="size-4" />
        </button>
      </div>
      {unit.unit_type && <p className="text-white/70">{unit.unit_type}</p>}
      <ul className="mt-5 grid grid-cols-2 gap-3">
        {facts.map(({ icon: Icon, label }) => (
          <li key={label} className="flex items-center gap-2 text-white/85">
            <Icon className="size-4.5 text-site-brass" aria-hidden /> {label}
          </li>
        ))}
      </ul>
      {unit.price != null && (
        <div className="mt-6 border-t border-white/10 pt-5">
          <p className="text-sm text-white/60">Price</p>
          <p className="tabular text-3xl font-bold text-white">
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
        <button
          type="button"
          onClick={() => enquiry.open('enquiry', subject)}
          className="flex items-center justify-center gap-2 rounded-full bg-site-primary px-5 py-3 font-medium text-white hover:bg-site-primary-dark"
        >
          <Mail className="size-4.5" aria-hidden /> {en.enquiry.cta.enquireUnit(unit.code)}
        </button>
        <div className="grid grid-cols-2 gap-2.5">
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-full border border-white/25 px-4 py-3 font-medium text-white hover:bg-white/10"
            >
              <MessageCircle className="size-4.5" aria-hidden /> {en.nav.whatsapp}
            </a>
          )}
          {tel && (
            <a
              href={tel}
              className={cn(
                'flex items-center justify-center gap-2 rounded-full border border-white/25 px-4 py-3 font-medium text-white hover:bg-white/10',
                !wa && 'col-span-2',
              )}
            >
              <PhoneCall className="size-4.5" aria-hidden /> {en.nav.call}
            </a>
          )}
        </div>
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
  tel,
  onUnitChange,
}: {
  project: PublicProjectDetail;
  tel: string | null;
  /** the picked item's code, so the page's WhatsApp buttons can name it */
  onUnitChange?: (code: string | null) => void;
}) {
  const containers = project.containers.filter((c) => c.units.length > 0);
  // `?unit=A-5B` opens that unit (master plan §7.3): a buyer can send one flat to family
  const fromUrl = () => {
    const code = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('unit');
    const ci = containers.findIndex((c) => c.units.some((u) => u.code === code && u.public_status === 'available'));
    return ci < 0 ? null : { tab: ci, unit: containers[ci].units.find((u) => u.code === code)! };
  };
  const [tab, setTab] = useState(() => fromUrl()?.tab ?? 0);
  const [picked, setPickedState] = useState<PublicUnit | null>(() => fromUrl()?.unit ?? null);
  const details = useRef<HTMLDivElement>(null);
  useEffect(() => {
    onUnitChange?.(picked?.code ?? null);
  }, [picked, onUnitChange]);
  const setPicked = (u: PublicUnit | null) => {
    setPickedState(u);
    const url = new URL(window.location.href);
    if (u) url.searchParams.set('unit', u.code);
    else url.searchParams.delete('unit');
    window.history.replaceState(window.history.state, '', url);
    // on phones the details sit under the grid: bring them into view
    if (u && window.matchMedia('(max-width: 1023px)').matches) {
      requestAnimationFrame(() => details.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  };
  if (containers.length === 0) return null;

  const container = containers[Math.min(tab, containers.length - 1)];
  const byFloor = container.units.some((u) => u.floor != null);
  const all = containers.flatMap((c) => c.units);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="rounded-[20px] border border-site-line bg-white p-5 md:p-6">
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
      <div ref={details} className="scroll-mt-40 lg:sticky lg:top-40 lg:self-start">
        <UnitDetails
          key={picked?.code ?? "none"}
          unit={picked}
          project={project}
          itemLabel={project.item_label_singular}
          tel={tel}
        />
      </div>
    </div>
  );
}
