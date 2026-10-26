'use client';

import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowUpRight, CalendarDays } from 'lucide-react';
import { progressPublicRepository } from '@/lib/repositories/public/progress.public.repository';
import { en } from '../i18n/en';
import { Reveal } from '../motion';
import { SiteImage } from '../SiteImage';
import { Container, SectionHeader } from '../ui/SectionHeader';

const t = en.home.site;

function photoDate(date: string): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * "Live from our sites" (master plan §7.1 #6): the newest public site photos
 * across all projects, each linking to that project's progress section.
 * Horizontal scroll-snap on every screen size; hidden when nothing is published.
 */
export function SiteStrip() {
  const photos = useLiveQuery(() => progressPublicRepository.photoFeed(8), []);
  if (!photos || photos.length === 0) return null;

  return (
    <section className="mt-28 overflow-hidden">
      <Container>
        <Reveal>
          <SectionHeader eyebrow={t.eyebrow} title={t.title} accent={t.accent} lead={t.lead} />
        </Reveal>
      </Container>
      <ul className="mx-auto mt-10 flex max-w-7xl snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth px-4 pb-4 [scrollbar-width:thin] sm:px-6">
        {photos.map((p, i) => (
          <li key={p.id} className="w-[78%] shrink-0 snap-start sm:w-[46%] lg:w-[31%]">
            <Reveal delay={Math.min(i, 3) * 80}>
              <Link href={`/projects/${encodeURIComponent(p.project_code)}#progress`} className="group block">
                <div className="relative overflow-hidden rounded-[20px]">
                  <SiteImage image={p.image} fallback="" alt={p.image.alt} className="aspect-[4/3] transition-transform duration-700 ease-site-out group-hover:scale-105" />
                  <span className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-site-night/75 px-3 py-1 text-xs font-medium text-white backdrop-blur">
                    <CalendarDays className="size-3.5" aria-hidden /> {photoDate(p.taken_on)}
                  </span>
                  {p.project_progress_pct != null && (
                    <span className="absolute right-3 bottom-3 rounded-full bg-white px-3 py-1 text-xs font-semibold text-site-primary-dark shadow-site-1">
                      {t.complete(p.project_progress_pct)}
                    </span>
                  )}
                </div>
                <div className="mt-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display truncate text-lg font-semibold group-hover:text-site-primary">{p.project_name}</p>
                    {p.tower_name && <p className="text-sm text-site-muted">{p.tower_name}</p>}
                  </div>
                  <ArrowUpRight className="mt-1 size-5 shrink-0 text-site-faint transition-[color,transform] duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-site-primary" aria-hidden />
                </div>
              </Link>
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}
