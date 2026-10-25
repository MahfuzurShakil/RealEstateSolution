'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { areaOf, formatPublicPrice } from '@/lib/domain/public-portal';
import type { PublicProjectCard } from '@/lib/repositories/public/project.public.repository';
import { cn } from '@/lib/utils/cn';
import { Taka } from '../ProjectCard';
import { SiteImage } from '../SiteImage';
import { COVER_FALLBACK } from '../stock-images';
import { Reveal } from './motion';

interface AreaTile {
  area: string;
  projects: PublicProjectCard[];
  priceFrom: number | null;
}

export function areaTiles(cards: PublicProjectCard[]): AreaTile[] {
  const byArea = new Map<string, PublicProjectCard[]>();
  for (const c of cards) {
    const area = areaOf(c.location_summary);
    if (area) byArea.set(area, [...(byArea.get(area) ?? []), c]);
  }
  return [...byArea.entries()]
    .map(([area, projects]) => {
      const prices = projects.map((p) => p.price_from).filter((p): p is number => p !== null);
      return { area, projects, priceFrom: prices.length ? Math.min(...prices) : null };
    })
    .sort((a, b) => b.projects.length - a.projects.length || a.area.localeCompare(b.area));
}

/**
 * Where the projects are — Uttara, Bashundhara, Purbachal — because that is
 * the first thing a Dhaka buyer narrows by. The first tile is the area with
 * the most projects, drawn larger.
 */
export function AreaGrid({ cards }: { cards: PublicProjectCard[] }) {
  const tiles = areaTiles(cards).slice(0, 5);
  if (tiles.length < 2) return null;

  return (
    <div className="mt-12 grid auto-rows-[220px] gap-5 md:grid-cols-3">
      {tiles.map((t, i) => {
        const lead = t.projects[0];
        return (
          <Reveal key={t.area} delay={i * 90} className={cn('h-full', i === 0 && 'md:col-span-2 md:row-span-2')}>
            <Link
              href={`/projects?area=${encodeURIComponent(t.area)}`}
              className="group relative block size-full overflow-hidden rounded-2xl"
            >
              <SiteImage
                image={lead.cover}
                fallback={COVER_FALLBACK[lead.project_type]}
                alt={t.area}
                className="absolute inset-0 size-full transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-linear-to-t from-slate-950/85 via-slate-950/30 to-transparent" />
              <span className="absolute top-4 right-4 grid size-10 place-items-center rounded-full bg-white/15 text-white backdrop-blur transition-colors group-hover:bg-site-primary">
                <ArrowUpRight className="size-5" />
              </span>
              <div className="absolute inset-x-0 bottom-0 p-6 text-white">
                <p className={cn('font-semibold', i === 0 ? 'text-3xl' : 'text-2xl')}>{t.area}</p>
                <p className="mt-1 text-white/80">
                  {t.projects.length === 1 ? '1 project' : `${t.projects.length} projects`}
                  {t.priceFrom ? (
                    <>
                      {' · from '}
                      <Taka text={formatPublicPrice(t.priceFrom)} />
                    </>
                  ) : null}
                </p>
              </div>
            </Link>
          </Reveal>
        );
      })}
    </div>
  );
}
