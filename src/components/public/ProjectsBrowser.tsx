'use client';

import dynamic from 'next/dynamic';
import { useLiveQuery } from 'dexie-react-hooks';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, ViewTransition } from 'react';
import { ChevronDown, LayoutGrid, List, Mail, Map as MapIcon, MessageCircle, SlidersHorizontal, X } from 'lucide-react';
import { PROJECT_TYPES, type ProjectType } from '@/lib/db/types';
import { PROJECT_TYPE_LABEL } from '@/lib/domain/project';
import {
  PUBLIC_PRICE_BANDS,
  PUBLIC_STAGE_LABEL,
  areaOf,
  whatsappLink,
  type PublicPriceBand,
  type PublicStage,
} from '@/lib/domain/public-portal';
import { publicProjectRepository, type PublicProjectCard, type PublicProjectFilters } from '@/lib/repositories/public/project.public.repository';
import { cn } from '@/lib/utils/cn';
import { en } from './i18n/en';
import { Reveal } from './motion';
import { ProjectCard, ProjectCardSkeleton } from './ProjectCard';
import { Button, ButtonLink } from './ui/Button';
import { useEnquiry } from './enquiry/EnquiryProvider';
import { Container, SectionHeader } from './ui/SectionHeader';
import { useCompanyInfo } from './useCompanyInfo';

const ProjectsMap = dynamic(() => import('./ProjectsMap'), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-site-soft" />,
});

/*
 * The listing (master plan §7.2). Everything lives in the URL —
 * `?type=apartment&stage=ongoing&price=1_1_5cr&area=Uttara&available=1&sort=price_asc&view=map`
 * — so the home page, the header menu and a buyer's WhatsApp to family all link
 * straight into the same filtered list. Filter options only offer what exists.
 */

const t = en.listing;
const STAGES: PublicStage[] = ['upcoming', 'ongoing', 'ready', 'completed'];
/** Homes first — `PROJECT_TYPES` leads with the land types, which is admin order, not a buyer's. */
const TYPE_ORDER: ProjectType[] = ['apartment', 'mixed', 'commercial', 'plot_development', 'land_share'];
type Sort = keyof typeof t.sorts;
type View = keyof typeof t.views;
const SORTS = Object.keys(t.sorts) as Sort[];
const PAGE = 12;

function readFilters(params: URLSearchParams): PublicProjectFilters {
  const list = <T extends string>(key: string, allowed: readonly T[]) =>
    params.getAll(key).filter((v): v is T => (allowed as readonly string[]).includes(v));
  return {
    project_types: list<ProjectType>('type', PROJECT_TYPES),
    stages: list<PublicStage>('stage', STAGES),
    price_bands: list<PublicPriceBand>('price', PUBLIC_PRICE_BANDS.map((b) => b.key)),
    location: params.get('location') ?? undefined,
    area: params.get('area') ?? undefined,
    available_only: params.get('available') === '1',
  };
}

function sortCards(cards: PublicProjectCard[], sort: Sort): PublicProjectCard[] {
  const price = (c: PublicProjectCard, missing: number) => c.price_from ?? missing;
  const copy = [...cards];
  if (sort === 'price_asc') copy.sort((a, b) => price(a, Infinity) - price(b, Infinity));
  if (sort === 'price_desc') copy.sort((a, b) => price(b, -1) - price(a, -1));
  if (sort === 'handover') copy.sort((a, b) => (a.expected_completion_date ?? '9999').localeCompare(b.expected_completion_date ?? '9999'));
  return copy; // 'featured': the repository's own order — featured first, then newest
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors duration-200',
        active ? 'border-site-primary bg-site-primary text-white' : 'border-site-line bg-white text-site-ink hover:border-site-primary hover:text-site-primary',
      )}
    >
      {children}
    </button>
  );
}

/** Desktop filter button with a drop-down panel; Esc or a click outside closes it. */
function Popover({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onDown = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [open]);
  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors',
          count > 0 ? 'border-site-primary bg-site-primary-soft text-site-primary-dark' : 'border-site-line bg-white hover:border-site-primary',
        )}
      >
        {label}
        {count > 0 && <span className="tabular grid size-5 place-items-center rounded-full bg-site-primary text-[11px] text-white">{count}</span>}
        <ChevronDown className={cn('size-4 transition-transform duration-200', open && 'rotate-180')} aria-hidden />
      </button>
      <div
        className={cn(
          'absolute top-full left-0 z-30 mt-2 w-max max-w-[22rem] rounded-2xl border border-site-line bg-white p-4 shadow-site-3 transition-[opacity,translate] duration-200 ease-site-out',
          open ? 'visible translate-y-0 opacity-100' : 'invisible -translate-y-1 opacity-0',
        )}
      >
        <div className="flex flex-wrap gap-2">{children}</div>
      </div>
    </div>
  );
}

export function ProjectsBrowser() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const company = useCompanyInfo();
  const enquiry = useEnquiry();
  const [sheet, setSheet] = useState(false);
  const [shownCount, setShownCount] = useState(PAGE);
  const [hovered, setHovered] = useState<string | null>(null);

  const filters = readFilters(params);
  const sort: Sort = SORTS.includes(params.get('sort') as Sort) ? (params.get('sort') as Sort) : 'featured';
  const view: View = (['grid', 'list', 'map'] as View[]).includes(params.get('view') as View) ? (params.get('view') as View) : 'grid';
  const key = params.toString();
  const cards = useLiveQuery(() => publicProjectRepository.list(readFilters(new URLSearchParams(key))), [key]);
  const all = useLiveQuery(() => publicProjectRepository.list(), []);
  const areas = [...new Set((all ?? []).map((c) => areaOf(c.location_summary)).filter((a): a is string => !!a))].sort();
  const types = TYPE_ORDER.filter((ty) => all?.some((c) => c.project_type === ty));
  const stages = STAGES.filter((s) => all?.some((c) => c.stage === s));
  // every band stays on offer: the repository matches a band against each available unit, not only the card's "from" price
  const bands = PUBLIC_PRICE_BANDS;

  // completed projects are a portfolio, not stock: shown apart unless asked for by the stage filter
  const askedCompleted = !!filters.stages?.includes('completed');
  const sorted = sortCards(cards ?? [], sort);
  const live = askedCompleted ? sorted : sorted.filter((c) => c.stage !== 'completed');
  const delivered = askedCompleted ? [] : sorted.filter((c) => c.stage === 'completed');
  const page = live.slice(0, shownCount);

  const update = (mutate: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(params.toString());
    mutate(next);
    const qs = next.toString();
    setShownCount(PAGE);
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const toggle = (name: string, value: string) =>
    update((next) => {
      const values = next.getAll(name);
      next.delete(name);
      (values.includes(value) ? values.filter((v) => v !== value) : [...values, value]).forEach((v) => next.append(name, v));
    });
  const setParam = (name: string, value: string | null) => update((next) => (value ? next.set(name, value) : next.delete(name)));

  // active filters as removable chips
  const active: { label: string; remove: () => void }[] = [
    ...(filters.project_types ?? []).map((ty) => ({ label: PROJECT_TYPE_LABEL[ty], remove: () => toggle('type', ty) })),
    ...(filters.stages ?? []).map((s) => ({ label: PUBLIC_STAGE_LABEL[s], remove: () => toggle('stage', s) })),
    ...(filters.price_bands ?? []).map((b) => ({ label: PUBLIC_PRICE_BANDS.find((x) => x.key === b)!.label, remove: () => toggle('price', b) })),
    ...(filters.area ? [{ label: filters.area, remove: () => setParam('area', null) }] : []),
    ...(filters.location ? [{ label: filters.location, remove: () => setParam('location', null) }] : []),
    ...(filters.available_only ? [{ label: t.availableOnly, remove: () => setParam('available', null) }] : []),
  ];
  const clearAll = () =>
    update((next) => {
      ['type', 'stage', 'price', 'area', 'location', 'available'].forEach((k) => next.delete(k));
    });

  // mobile sheet: lock scroll, Esc closes
  useEffect(() => {
    if (!sheet) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSheet(false);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [sheet]);

  const typeChips = types.map((ty) => (
    <Chip key={ty} active={!!filters.project_types?.includes(ty)} onClick={() => toggle('type', ty)}>
      {PROJECT_TYPE_LABEL[ty]}
    </Chip>
  ));
  const stageChips = stages.map((s) => (
    <Chip key={s} active={!!filters.stages?.includes(s)} onClick={() => toggle('stage', s)}>
      {PUBLIC_STAGE_LABEL[s]}
    </Chip>
  ));
  const budgetChips = bands.map((b) => (
    <Chip key={b.key} active={!!filters.price_bands?.includes(b.key)} onClick={() => toggle('price', b.key)}>
      {b.label}
    </Chip>
  ));
  const areaChips = areas.map((a) => (
    <Chip key={a} active={filters.area === a} onClick={() => setParam('area', filters.area === a ? null : a)}>
      {a}
    </Chip>
  ));
  const availableToggle = (
    <label className="flex h-10 cursor-pointer items-center gap-2.5 rounded-full border border-site-line bg-white px-4 text-sm font-semibold">
      <input
        type="checkbox"
        checked={!!filters.available_only}
        onChange={(e) => setParam('available', e.target.checked ? '1' : null)}
        className="size-4 accent-site-primary"
      />
      {t.availableOnly}
    </label>
  );
  const sortSelect = (
    <label className="flex h-10 items-center gap-2 rounded-full border border-site-line bg-white pr-2 pl-4 text-sm font-semibold">
      <span className="sr-only sm:not-sr-only text-site-muted">{t.sort}</span>
      <select value={sort} onChange={(e) => setParam('sort', e.target.value === 'featured' ? null : e.target.value)} className="h-full max-w-[9.5rem] bg-transparent outline-none sm:max-w-none">
        {SORTS.map((s) => (
          <option key={s} value={s}>
            {t.sorts[s]}
          </option>
        ))}
      </select>
    </label>
  );
  const viewToggle = (
    <div role="radiogroup" aria-label="View" className="flex h-10 items-center rounded-full border border-site-line bg-white p-1">
      {([['grid', LayoutGrid], ['list', List], ['map', MapIcon]] as const).map(([v, Icon]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={view === v}
          aria-label={t.views[v]}
          title={t.views[v]}
          onClick={() => setParam('view', v === 'grid' ? null : v)}
          className={cn('grid h-8 w-9 place-items-center rounded-full transition-colors', view === v ? 'bg-site-primary text-white' : 'text-site-muted hover:text-site-ink')}
        >
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  );

  const tellUs = company?.whatsapp_number ? whatsappLink(company.whatsapp_number, t.tellUsText) : null;
  const empty = (
    <div className="rounded-[20px] border border-dashed border-site-line bg-white px-6 py-14 text-center">
      <p className="text-xl font-semibold">{active.length > 0 ? t.emptyTitle : t.emptyNoneTitle}</p>
      <p className="mx-auto mt-2 max-w-md text-site-muted">{active.length > 0 ? t.emptyBody : t.emptyNoneBody}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {active.length > 0 && (
          <button type="button" onClick={clearAll} className="h-11 rounded-full border border-site-line px-6 text-sm font-semibold hover:border-site-primary">
            {t.clearAll}
          </button>
        )}
        <Button icon={<Mail className="size-4" />} onClick={() => enquiry.open('enquiry')}>
          {t.tellUs}
        </Button>
        {tellUs && (
          <ButtonLink href={tellUs} variant="whatsapp" icon={<MessageCircle className="size-4" />}>
            {en.nav.whatsapp}
          </ButtonLink>
        )}
      </div>
    </div>
  );

  const results =
    cards === undefined ? (
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <ProjectCardSkeleton key={i} />
        ))}
      </div>
    ) : live.length === 0 ? (
      empty
    ) : view === 'map' ? (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <ul className="order-2 space-y-4 lg:order-1 lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto lg:pr-2">
          {live.map((c) => (
            <li key={c.code} onMouseEnter={() => setHovered(c.code)} onMouseLeave={() => setHovered(null)}>
              <ProjectCard card={c} layout="list" />
            </li>
          ))}
        </ul>
        <div className="order-1 h-[360px] overflow-hidden rounded-[20px] border border-site-line lg:sticky lg:top-40 lg:order-2 lg:h-[calc(100vh-12rem)]">
          <ProjectsMap cards={live} activeCode={hovered} />
        </div>
      </div>
    ) : (
      <ViewTransition key={`${key}`} enter="auto" exit="auto" default="none">
        <div className={cn('grid gap-6', view === 'list' ? 'grid-cols-1' : 'sm:grid-cols-2 xl:grid-cols-3')}>
          {page.map((card, i) => (
            <Reveal key={card.code} delay={(i % 3) * 60}>
              <ProjectCard card={card} layout={view === 'list' ? 'list' : 'grid'} />
            </Reveal>
          ))}
        </div>
      </ViewTransition>
    );

  return (
    <>
      <Container className="pt-10 md:pt-14">
        <SectionHeader as="h1" eyebrow={t.eyebrow} title={t.title} accent={t.accent} lead={t.lead} />
      </Container>

      {/* sticky filter bar — sits under the header */}
      <div className="sticky top-18 z-30 mt-8 border-y border-site-line bg-site-ivory/90 backdrop-blur-md lg:top-20">
        <Container className="flex flex-wrap items-center gap-2 py-3">
          <div className="hidden flex-wrap items-center gap-2 lg:flex">
            {types.length > 1 && <Popover label={t.type} count={filters.project_types?.length ?? 0}>{typeChips}</Popover>}
            {stages.length > 1 && <Popover label={t.stage} count={filters.stages?.length ?? 0}>{stageChips}</Popover>}
            <Popover label={t.budget} count={filters.price_bands?.length ?? 0}>{budgetChips}</Popover>
            {areas.length > 1 && <Popover label={t.area} count={filters.area ? 1 : 0}>{areaChips}</Popover>}
            {availableToggle}
          </div>
          <button
            type="button"
            onClick={() => setSheet(true)}
            className="flex h-10 items-center gap-2 rounded-full border border-site-line bg-white px-4 text-sm font-semibold lg:hidden"
          >
            <SlidersHorizontal className="size-4" aria-hidden /> {t.filters}
            {active.length > 0 && <span className="tabular grid size-5 place-items-center rounded-full bg-site-primary text-[11px] text-white">{active.length}</span>}
          </button>
          <div className="ml-auto flex items-center gap-2">
            {sortSelect}
            {viewToggle}
          </div>
        </Container>
      </div>

      <Container className="pt-6">
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-2 text-sm font-semibold text-site-muted" aria-live="polite">
            {cards === undefined ? en.common.loading : t.count(live.length)}
          </p>
          {active.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={a.remove}
              className="flex items-center gap-1 rounded-full bg-site-primary-soft py-1 pr-2 pl-3 text-sm font-medium text-site-primary-dark transition-colors hover:bg-site-primary hover:text-white"
              aria-label={`Remove ${a.label}`}
            >
              {a.label} <X className="size-3.5" aria-hidden />
            </button>
          ))}
          {active.length > 1 && (
            <button type="button" onClick={clearAll} className="text-sm font-semibold text-site-primary underline-offset-4 hover:underline">
              {t.clearAll}
            </button>
          )}
        </div>
        {view === 'map' && live.some((c) => !c.point) && <p className="mt-2 text-xs text-site-muted">{t.mapHint}</p>}

        <div className="mt-6">{results}</div>

        {view !== 'map' && live.length > page.length && (
          <div className="mt-10 text-center">
            <button
              type="button"
              onClick={() => setShownCount((n) => n + PAGE)}
              className="h-12 rounded-full border border-site-line bg-white px-7 font-semibold transition-colors hover:border-site-primary hover:text-site-primary"
            >
              {t.loadMore}
            </button>
          </div>
        )}
      </Container>

      {delivered.length > 0 && (
        <Container className="mt-24">
          <SectionHeader title={t.completedTitle} accent={t.completedAccent} lead={t.completedLead} />
          <div className="mt-10 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {delivered.map((card) => (
              <ProjectCard key={card.code} card={card} />
            ))}
          </div>
        </Container>
      )}

      {/* phone: filters in a bottom sheet */}
      {sheet && (
        <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label={t.filters}>
          <button type="button" aria-label="Close filters" className="absolute inset-0 bg-site-night/50 motion-safe:animate-[site-fade-in_.2s_ease-out]" onClick={() => setSheet(false)} />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-[28px] bg-site-ivory motion-safe:animate-[site-sheet-up_.32s_var(--ease-site-out)]">
            <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-site-line" aria-hidden />
            <div className="flex items-center justify-between px-5 pt-3 pb-2">
              <p className="font-display text-2xl font-semibold">{t.filters}</p>
              <button type="button" aria-label="Close filters" onClick={() => setSheet(false)} className="grid size-10 place-items-center rounded-full bg-white shadow-site-1">
                <X className="size-4" />
              </button>
            </div>
            <div className="flex-1 space-y-7 overflow-y-auto px-5 py-4">
              {[
                [t.type, types.length > 1 && typeChips],
                [t.stage, stages.length > 1 && stageChips],
                [t.budget, budgetChips],
                [t.area, areas.length > 1 && areaChips],
              ].map(([label, chips]) =>
                chips ? (
                  <fieldset key={label as string}>
                    <legend className="mb-3 text-xs font-semibold tracking-[0.16em] text-site-brass-dark uppercase">{label}</legend>
                    <div className="flex flex-wrap gap-2">{chips}</div>
                  </fieldset>
                ) : null,
              )}
              {availableToggle}
            </div>
            <div className="flex gap-3 border-t border-site-line p-4">
              {active.length > 0 && (
                <button type="button" onClick={clearAll} className="h-12 rounded-full border border-site-line px-5 text-sm font-semibold">
                  {t.clearAll}
                </button>
              )}
              <button type="button" onClick={() => setSheet(false)} className="h-12 flex-1 rounded-full bg-site-primary text-sm font-semibold text-white">
                {t.showResults(live.length)}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
