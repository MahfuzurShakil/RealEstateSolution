'use client';

import { SalesBadge } from '@/components/public/ui/Badge';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft,
  BedDouble,
  Bath,
  Building,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  Download,
  FileText,
  KeyRound,
  Landmark,
  Layers,
  MapPin,
  MessageCircle,
  Navigation,
  PhoneCall,
  Ruler,
  Signpost,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import {
  PUBLIC_STAGE_LABEL,
  formatPublicPrice,
  whatsappLink,
} from '@/lib/domain/public-portal';
import {
  publicProjectRepository,
  type PublicDownload,
  type PublicImage,
  type PublicProjectDetail,
} from '@/lib/repositories/public/project.public.repository';
import { cn } from '@/lib/utils/cn';
import { InstalmentPlanner } from '../home/InstalmentPlanner';
import { Reveal } from '../motion';
import { ProjectCard, Taka } from '../ProjectCard';
import { COVER_FALLBACK } from '../stock-images';
import { useCompanyInfo } from '../useCompanyInfo';
import { Availability } from './Availability';
import { ProjectGallery } from './ProjectGallery';

/*
 * Project detail (Public Portal v2.0 §3.5). Sections follow what a Dhaka buyer
 * checks, in order: price and what is left, the flat types, which floor is
 * still open, the building itself, how far construction has gone, the papers
 * to download, where it is, and what a month would cost. A plot scheme shows
 * blocks and plots instead of floors; a land share shows its register.
 */

function handover(date: string | null): string | null {
  if (!date) return null;
  const d = new Date(`${date}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function Section({ id, title, children, className }: { id: string; title: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={cn('scroll-mt-40', className)}>
      <Reveal>
        <h2 className="text-2xl font-semibold md:text-[28px]">{title}</h2>
        <div className="mt-6">{children}</div>
      </Reveal>
    </section>
  );
}

function Fact({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3.5 rounded-2xl bg-site-soft p-4">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white text-site-primary shadow-sm">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm text-site-muted">{label}</span>
        <span className="block truncate font-semibold">{value}</span>
      </span>
    </div>
  );
}

function download(file: PublicDownload) {
  if (file.url) {
    window.open(file.url, '_blank', 'noopener');
    return;
  }
  if (!file.blob) return;
  const url = URL.createObjectURL(file.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.file_name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function galleryOf(p: PublicProjectDetail): PublicImage[] {
  const seen = new Set<string>();
  const out: PublicImage[] = [];
  for (const img of [p.cover, ...p.gallery]) {
    if (!img) continue;
    const key = img.kind === 'blob' ? img.id : img.url;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(img);
  }
  return out;
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-36 shrink-0">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--color-site-line)" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="var(--color-site-primary)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          className="transition-[stroke-dashoffset] duration-1000"
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-center">
        <span>
          <span className="block text-3xl font-bold">{pct}%</span>
          <span className="block text-xs text-site-muted">complete</span>
        </span>
      </span>
    </div>
  );
}

function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-32 text-center">
      <p className="text-sm font-semibold tracking-[0.2em] text-site-primary uppercase">Not available</p>
      <h1 className="mt-3 text-3xl font-semibold">This project is not on our website</h1>
      <p className="mt-3 text-site-muted">It may have sold out or been taken down. Have a look at what is open now.</p>
      <Link
        href="/projects"
        className="mt-8 inline-flex items-center gap-2 rounded-full bg-site-primary px-6 py-3 font-medium text-white"
      >
        <ArrowLeft className="size-4" /> All projects
      </Link>
    </div>
  );
}

export function ProjectDetail({ code }: { code: string }) {
  const project = useLiveQuery(() => publicProjectRepository.detail(code), [code]);
  const others = useLiveQuery(() => publicProjectRepository.list(), []);
  const company = useCompanyInfo();

  if (project === undefined) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-10 sm:px-6">
        <div className="h-10 w-2/3 animate-pulse rounded-xl bg-site-soft" />
        <div className="h-[460px] animate-pulse rounded-2xl bg-site-soft" />
      </div>
    );
  }
  if (project === null) return <NotFound />;

  const tel = company?.phone ? `tel:${company.phone.replace(/[^\d+]/g, '')}` : null;
  const wa = (message: string) => (company?.whatsapp_number ? whatsappLink(company.whatsapp_number, message) : null);
  const projectMessage = `Hi, I'm interested in ${project.name} (${project.code}). Please share the details.`;
  const built = project.container_kind === 'tower';
  const land = project.container_kind !== 'tower';
  const handoverText = handover(project.expected_completion_date);
  const towers = project.containers.filter((c) => c.floor_count != null);
  const similar = (others ?? []).filter((c) => c.code !== project.code && c.stage !== 'completed').slice(0, 3);
  const downloads = [...(project.brochure ? [{ ...project.brochure, title: 'Project brochure' }] : []), ...project.floor_plans];

  const facts: { icon: LucideIcon; label: string; value: string }[] = [
    { icon: Building, label: 'Project type', value: project.type_label },
    { icon: Layers, label: 'Stage', value: PUBLIC_STAGE_LABEL[project.stage] },
    ...(handoverText ? [{ icon: CalendarCheck, label: 'Handover', value: handoverText }] : []),
    ...(project.total_land_area ? [{ icon: Landmark, label: 'Land area', value: project.total_land_area }] : []),
    ...(project.front_road_ft ? [{ icon: Signpost, label: 'Front road', value: `${project.front_road_ft} ft` }] : []),
    {
      icon: KeyRound,
      label: `${project.item_label} available`,
      value: project.total_count ? `${project.available_count} of ${project.total_count}` : 'Coming soon',
    },
  ];

  const nav = [
    { id: 'overview', label: 'Overview' },
    { id: 'availability', label: 'Availability' },
    ...(towers.length ? [{ id: 'specification', label: 'Specification' }] : []),
    ...(built && project.progress_pct != null ? [{ id: 'progress', label: 'Progress' }] : []),
    { id: 'location', label: 'Location' },
    ...(project.price_from ? [{ id: 'payment', label: 'Payment plan' }] : []),
  ];

  return (
    <>
      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
        <nav className="flex items-center gap-1.5 text-sm text-site-muted" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-site-primary">Home</Link>
          <ChevronRight className="size-4" />
          <Link href="/projects" className="hover:text-site-primary">Projects</Link>
          <ChevronRight className="size-4" />
          <span className="truncate text-site-ink">{project.name}</span>
        </nav>

        <header className="mt-6 flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-2">
              <SalesBadge badge={project.sales_badge} className="px-3.5 text-sm" />
              <span className="rounded-full bg-site-soft px-3.5 py-1 text-sm font-medium">
                {project.type_label} · {PUBLIC_STAGE_LABEL[project.stage]}
              </span>
            </div>
            <h1 className="mt-4 text-3xl leading-tight font-bold md:text-5xl">{project.name}</h1>
            {project.location_summary && (
              <p className="mt-3 flex items-start gap-2 text-lg text-site-muted">
                <MapPin className="mt-1 size-5 shrink-0 text-site-primary" /> {project.location_summary}
              </p>
            )}
          </div>
          {project.price_from && (
            <div className="text-right">
              <p className="text-site-muted">Starting from</p>
              <p className="text-3xl font-bold text-site-primary md:text-4xl">
                <Taka text={formatPublicPrice(project.price_from)} />
              </p>
              {project.size_range && <p className="text-site-muted">{project.size_range}</p>}
            </div>
          )}
        </header>

        <div className="mt-8">
          <ProjectGallery images={galleryOf(project)} fallback={COVER_FALLBACK[project.project_type]} name={project.name} />
        </div>
      </div>

      {/* section nav, pinned under the header while scrolling */}
      <div className="sticky top-20 z-30 mt-8 border-y border-site-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6">
          {nav.map((n) => (
            <a
              key={n.id}
              href={`#${n.id}`}
              className="shrink-0 border-b-2 border-transparent px-4 py-4 text-[15px] font-medium text-site-muted transition-colors hover:border-site-primary hover:text-site-ink"
            >
              {n.label}
            </a>
          ))}
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-12 px-4 pt-12 sm:px-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-20">
          <Section id="overview" title="Overview">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {facts.map((f) => (
                <Fact key={f.label} {...f} />
              ))}
            </div>

            {project.unit_types.length > 0 && (
              <div className="mt-10">
                <h3 className="text-xl font-semibold">Apartment types</h3>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {project.unit_types.map((t) => (
                    <div key={t.unit_type} className="rounded-2xl border border-site-line p-5 transition-shadow hover:shadow-lg">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-lg font-semibold">{t.unit_type}</p>
                        <span
                          className={cn(
                            'rounded-full px-2.5 py-0.5 text-xs font-medium',
                            t.available_count ? 'bg-site-primary-soft text-site-primary-dark' : 'bg-slate-100 text-slate-500',
                          )}
                        >
                          {t.available_count ? `${t.available_count} left` : 'All booked'}
                        </span>
                      </div>
                      {t.size_range && (
                        <p className="mt-1 flex items-center gap-1.5 text-site-muted">
                          <Ruler className="size-4" /> {t.size_range}
                        </p>
                      )}
                      {t.bedroom_count != null && (
                        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[15px]">
                          <li className="flex items-center gap-1.5"><BedDouble className="size-4 text-site-primary" /> {t.bedroom_count} {t.bedroom_count === 1 ? 'bed' : 'beds'}</li>
                          {t.bathroom_count != null && <li className="flex items-center gap-1.5"><Bath className="size-4 text-site-primary" /> {t.bathroom_count} {t.bathroom_count === 1 ? 'bath' : 'baths'}</li>}
                          {t.balcony_count != null && <li className="flex items-center gap-1.5"><Sun className="size-4 text-site-primary" /> {t.balcony_count} {t.balcony_count === 1 ? 'balcony' : 'balconies'}</li>}
                        </ul>
                      )}
                      <p className="mt-4 border-t border-site-line pt-3 text-site-muted">
                        {t.price_from ? (
                          <>
                            From <span className="text-lg font-semibold text-site-ink"><Taka text={formatPublicPrice(t.price_from)} /></span>
                          </>
                        ) : (
                          'Price on request'
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {project.construction_planned && (
              <p className="mt-8 rounded-2xl bg-site-primary-soft p-5 text-site-primary-dark">
                A building on this land is planned once all the shares are sold.
              </p>
            )}

            {(project.amenities.length > 0 || project.surroundings.length > 0) && (
              <div className="mt-10 grid gap-8 md:grid-cols-2">
                {project.amenities.length > 0 && (
                  <div>
                    <h3 className="text-xl font-semibold">Facilities</h3>
                    <ul className="mt-4 grid grid-cols-2 gap-3">
                      {project.amenities.map((a) => (
                        <li key={a} className="flex items-center gap-2">
                          <CheckCircle2 className="size-5 text-site-primary" /> {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {project.surroundings.length > 0 && (
                  <div>
                    <h3 className="text-xl font-semibold">What&apos;s nearby</h3>
                    <ul className="mt-4 space-y-3">
                      {project.surroundings
                        .flatMap((s) => s.split(/,\s*/))
                        .map((s) => (
                          <li key={s} className="flex items-start gap-2">
                            <Navigation className="mt-0.5 size-4.5 shrink-0 text-site-primary" /> {s}
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </Section>

          <Section
            id="availability"
            title={land ? (project.container_kind === 'none' ? 'Share availability' : 'Plot availability') : 'Floor-wise availability'}
          >
            {project.total_count === 0 ? (
              <p className="rounded-2xl bg-site-soft p-6 text-site-muted">
                {project.item_label} for this project will be listed soon. Call us to register your interest.
              </p>
            ) : (
              <Availability project={project} whatsapp={wa} tel={tel} />
            )}
          </Section>

          {towers.length > 0 && (
            <Section id="specification" title="Building specification">
              <div className={cn('grid gap-5', towers.length > 1 && 'md:grid-cols-2')}>
                {towers.map((t) => {
                  const rows: [string, string | null][] = [
                    ['Building type', t.building_type],
                    ['Floors', t.floor_count != null ? String(t.floor_count) : null],
                    ['Basements', t.basement_count ? String(t.basement_count) : null],
                    ['Units per floor', t.unit_per_floor != null ? String(t.unit_per_floor) : null],
                    ['Passenger lifts', t.lift_count != null ? String(t.lift_count) : null],
                    ['Staircases', t.staircase_count != null ? String(t.staircase_count) : null],
                    ['Typical floor area', t.floor_area_sqft ? `${t.floor_area_sqft.toLocaleString('en-US')} sqft` : null],
                    ['Generator backup', t.electricity_backup == null ? null : t.electricity_backup ? 'Yes, full load' : 'No'],
                  ];
                  return (
                    <div key={t.name} className="overflow-hidden rounded-2xl border border-site-line">
                      <p className="bg-site-soft px-5 py-3.5 font-semibold">{t.name}</p>
                      <dl className="divide-y divide-site-line">
                        {rows
                          .filter((r): r is [string, string] => r[1] !== null)
                          .map(([k, v]) => (
                            <div key={k} className="flex justify-between gap-4 px-5 py-3">
                              <dt className="text-site-muted">{k}</dt>
                              <dd className="font-medium">{v}</dd>
                            </div>
                          ))}
                      </dl>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {built && project.progress_pct != null && (
            <Section id="progress" title="Construction progress">
              <div className="flex flex-col gap-8 rounded-2xl border border-site-line p-6 sm:flex-row sm:items-center">
                <ProgressRing pct={project.progress_pct} />
                <div className="flex-1 space-y-5">
                  {towers.map((t) => (
                    <div key={t.name}>
                      <div className="flex justify-between text-[15px]">
                        <span className="font-medium">{t.name}</span>
                        <span className="text-site-muted">{t.progress_pct ?? 0}%</span>
                      </div>
                      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-site-line">
                        <div
                          className="h-full rounded-full bg-site-primary transition-[width] duration-1000"
                          style={{ width: `${t.progress_pct ?? 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  <p className="text-sm text-site-muted">Updated from the site log. Site photos are added as work goes on.</p>
                </div>
              </div>
            </Section>
          )}

          {downloads.length > 0 && (
            <Section id="documents" title={built ? 'Brochure & floor plans' : 'Brochure & layout'}>
              <div className="grid gap-3 sm:grid-cols-2">
                {downloads.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => download(d)}
                    className="group flex items-center gap-4 rounded-2xl border border-site-line p-4 text-left transition-colors hover:border-site-primary"
                  >
                    <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-site-primary-soft text-site-primary">
                      <FileText className="size-6" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{d.title}</span>
                      {!d.file_name.startsWith(d.title) && (
                        <span className="block truncate text-sm text-site-muted">{d.file_name}</span>
                      )}
                    </span>
                    <Download className="size-5 text-site-muted transition-colors group-hover:text-site-primary" />
                  </button>
                ))}
              </div>
            </Section>
          )}

          <Section id="location" title="Location">
            <div className="flex flex-col gap-5 rounded-2xl bg-site-night p-6 text-white md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-site-primary text-white">
                  <MapPin className="size-6" />
                </span>
                <div>
                  <p className="text-lg font-semibold">{project.location_summary ?? project.name}</p>
                  {project.front_road_ft && <p className="text-white/70">Fronts a {project.front_road_ft} ft road</p>}
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                {project.map_url && (
                  <a
                    href={project.map_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-full bg-white px-5 py-2.5 font-medium text-site-ink"
                  >
                    <Navigation className="size-4.5" /> See on map
                  </a>
                )}
                {tel && (
                  <a href={tel} className="flex items-center gap-2 rounded-full border border-white/30 px-5 py-2.5 font-medium">
                    <PhoneCall className="size-4.5" /> Book a site visit
                  </a>
                )}
              </div>
            </div>
          </Section>

          {project.price_from && (
            <Section id="payment" title="Plan your payments">
              <InstalmentPlanner startingPrice={project.price_from} />
            </Section>
          )}
        </div>

        {/* contact card */}
        <aside className="hidden lg:block">
          <div className="sticky top-40 space-y-4">
            <div className="rounded-2xl border border-site-line p-6 shadow-lg shadow-slate-200/60">
              <p className="text-sm text-site-muted">Interested in this project?</p>
              <p className="mt-1 text-xl font-semibold">{project.name}</p>
              {project.price_from && (
                <p className="mt-4 text-site-muted">
                  From{' '}
                  <span className="text-2xl font-bold text-site-primary">
                    <Taka text={formatPublicPrice(project.price_from)} />
                  </span>
                </p>
              )}
              <p className="mt-1 text-sm text-site-muted">
                {project.total_count ? `${project.available_count} ${project.item_label.toLowerCase()} still available` : ''}
              </p>
              <div className="mt-6 space-y-2.5">
                {tel && (
                  <a href={tel} className="flex items-center justify-center gap-2 rounded-full bg-site-primary px-5 py-3 font-medium text-white hover:bg-site-primary-dark">
                    <PhoneCall className="size-4.5" /> Call {company?.phone}
                  </a>
                )}
                {wa(projectMessage) && (
                  <a
                    href={wa(projectMessage)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 rounded-full border border-site-line px-5 py-3 font-medium hover:border-site-primary hover:text-site-primary"
                  >
                    <MessageCircle className="size-4.5" /> WhatsApp us
                  </a>
                )}
              </div>
              <p className="mt-5 border-t border-site-line pt-4 text-sm text-site-muted">
                Free site visit · Land papers shown before booking · Project code {project.code}
              </p>
            </div>
          </div>
        </aside>
      </div>

      {similar.length > 0 && (
        <section className="mx-auto mt-24 max-w-7xl px-4 sm:px-6">
          <Reveal>
            <h2 className="text-2xl font-semibold md:text-[28px]">More projects on sale</h2>
          </Reveal>
          <div className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {similar.map((c, i) => (
              <Reveal key={c.code} delay={i * 100}>
                <ProjectCard card={c} />
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* phones: call and WhatsApp stay within thumb reach */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t border-site-line bg-white/95 p-3 backdrop-blur lg:hidden">
        {tel && (
          <a href={tel} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-site-primary py-3 font-medium text-white">
            <PhoneCall className="size-4.5" /> Call
          </a>
        )}
        {wa(projectMessage) && (
          <a
            href={wa(projectMessage)!}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-1 items-center justify-center gap-2 rounded-full border border-site-line py-3 font-medium"
          >
            <MessageCircle className="size-4.5" /> WhatsApp
          </a>
        )}
      </div>
    </>
  );
}
