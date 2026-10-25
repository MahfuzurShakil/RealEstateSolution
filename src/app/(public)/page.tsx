'use client';

import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, Building2, FileCheck2, HardHat, LandPlot, MessageCircle, Phone, Store, Users, type LucideIcon } from 'lucide-react';
import { ProjectCard, ProjectCardSkeleton } from '@/components/public/ProjectCard';
import { useCompanyInfo } from '@/components/public/useCompanyInfo';
import type { ProjectType } from '@/lib/db/types';
import { PUBLIC_TYPE_BLURB } from '@/lib/domain/public-portal';
import { publicProjectRepository } from '@/lib/repositories/public/project.public.repository';

/*
 * Home (Public Portal v2.0 §2.1): hero, browse by type, featured projects,
 * why-us strip, contact band. The latest blog posts join in PB7.
 */

const TYPE_ICON: Record<ProjectType, LucideIcon> = {
  apartment: Building2,
  mixed: Building2,
  commercial: Store,
  plot_development: LandPlot,
  land_share: Users,
};

const TRUST: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: FileCheck2,
    title: 'Paperwork first',
    body: 'Land and approval papers shown before you book, and a written agreement for every booking.',
  },
  {
    icon: HardHat,
    title: 'Progress you can see',
    body: 'Each building’s progress and site photos are published as the work happens.',
  },
  {
    icon: Store,
    title: 'Prices up front',
    body: 'Starting prices and what is still available are on every project page.',
  },
];

export default function HomePage() {
  const company = useCompanyInfo();
  const featured = useLiveQuery(() => publicProjectRepository.featured(6), []);
  const stats = useLiveQuery(() => publicProjectRepository.stats(), []);

  return (
    <>
      <section className="relative overflow-hidden bg-site-forest text-white">
        <div
          aria-hidden
          className="absolute inset-0 opacity-20 [background:radial-gradient(60rem_30rem_at_80%_-10%,var(--color-site-brass),transparent)]"
        />
        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <p className="mb-4 text-xs tracking-[0.3em] text-site-brass-light uppercase">
            {company?.company_name}
          </p>
          <h1 className="max-w-2xl font-display text-4xl leading-[1.1] sm:text-6xl">
            A home you can see being built.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-site-stone/90 sm:text-lg">
            Apartments, plots and land shares with clear prices, live availability and construction
            progress you can follow.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/projects"
              className="flex items-center gap-2 rounded-full bg-site-brass px-6 py-3 text-sm font-medium text-site-forest-deep transition-colors hover:bg-site-brass-light"
            >
              Browse projects <ArrowRight className="size-4" />
            </Link>
            {company?.phone && (
              <a
                href={`tel:${company.phone.replace(/\D/g, '')}`}
                className="flex items-center gap-2 rounded-full border border-white/30 px-6 py-3 text-sm text-white transition-colors hover:bg-white/10"
              >
                <Phone className="size-4" /> Talk to us
              </a>
            )}
          </div>
          {stats && (
            <dl className="mt-12 flex flex-wrap gap-x-12 gap-y-4">
              <div>
                <dt className="text-xs tracking-wide text-site-stone/70 uppercase">On sale now</dt>
                <dd className="font-display text-3xl text-site-brass-light">{stats.on_sale}</dd>
              </div>
              {stats.completed > 0 && (
                <div>
                  <dt className="text-xs tracking-wide text-site-stone/70 uppercase">Completed</dt>
                  <dd className="font-display text-3xl text-site-brass-light">{stats.completed}</dd>
                </div>
              )}
            </dl>
          )}
        </div>
      </section>

      {stats && stats.types.length > 1 && (
        <section className="mx-auto max-w-6xl px-4 pt-16 sm:px-6">
          <p className="text-xs tracking-[0.3em] text-site-brass uppercase">Browse by type</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.types.map((t) => {
              const Icon = TYPE_ICON[t.project_type];
              return (
                <Link
                  key={t.project_type}
                  href={`/projects?type=${t.project_type}`}
                  className="group rounded-2xl bg-white p-5 ring-1 ring-site-stone/60 transition-shadow hover:shadow-md"
                >
                  <Icon className="size-6 text-site-brass" strokeWidth={1.5} />
                  <p className="mt-4 font-display text-lg text-site-ink">{t.label}</p>
                  <p className="mt-1 text-sm leading-relaxed text-site-muted">{PUBLIC_TYPE_BLURB[t.project_type]}</p>
                  <p className="mt-4 flex items-center gap-1.5 text-sm text-site-forest">
                    {t.count === 1 ? '1 project' : `${t.count} projects`}
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </p>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs tracking-[0.3em] text-site-brass uppercase">Featured</p>
            <h2 className="mt-2 font-display text-3xl text-site-ink">Projects on sale</h2>
          </div>
          {featured && featured.length > 0 && (
            <Link href="/projects" className="flex items-center gap-1.5 text-sm text-site-forest">
              See all projects <ArrowRight className="size-4" />
            </Link>
          )}
        </div>

        {featured === undefined ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <ProjectCardSkeleton key={i} />
            ))}
          </div>
        ) : featured.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-site-stone bg-white/60 px-6 py-14 text-center">
            <p className="font-display text-xl text-site-ink">No projects on sale yet</p>
            <p className="mt-2 text-sm text-site-muted">
              New projects appear here as soon as they open for booking. Call or message us to hear first.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((card) => (
              <ProjectCard key={card.code} card={card} />
            ))}
          </div>
        )}
      </section>

      <section className="border-y border-site-stone/70 bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 md:grid-cols-3">
          {TRUST.map(({ icon: Icon, title, body }) => (
            <div key={title}>
              <Icon className="size-6 text-site-brass" strokeWidth={1.5} />
              <p className="mt-4 font-display text-lg text-site-ink">{title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-site-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {(company?.phone || company?.whatsapp_url) && (
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-6 rounded-3xl bg-site-forest px-6 py-10 text-white sm:px-10 md:flex-row md:items-center">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl">Want to visit a site?</h2>
              <p className="mt-2 text-sm text-site-stone/90">
                Our team will walk you through the project, the papers and the payment terms.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {company.phone && (
                <a
                  href={`tel:${company.phone.replace(/\D/g, '')}`}
                  className="flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm text-site-forest"
                >
                  <Phone className="size-4" /> {company.phone}
                </a>
              )}
              {company.whatsapp_url && (
                <a
                  href={company.whatsapp_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-full border border-white/30 px-5 py-3 text-sm text-white"
                >
                  <MessageCircle className="size-4" /> WhatsApp
                </a>
              )}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
