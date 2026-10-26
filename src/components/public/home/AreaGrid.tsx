'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { areaOf, formatPublicPrice } from '@/lib/domain/public-portal';
import type { PublicProjectCard } from '@/lib/repositories/public/project.public.repository';
import { cn } from '@/lib/utils/cn';
import { Taka } from '../ProjectCard';
import { SiteImage } from '../SiteImage';
import { COVER_FALLBACK } from '../stock-images';
import { Reveal } from '../motion';

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

/*
 * Bento layouts per tile count, so the grid never leaves a hole (audit §0):
 * the first tile — the area with the most projects — is drawn larger.
 */
const LAYOUT: Record<number, { grid: string; tiles: string[] }> = {
  2: { grid: 'md:grid-cols-2', tiles: ['', ''] },
  3: { grid: 'md:grid-cols-3', tiles: ['md:col-span-2 md:row-span-2', '', ''] },
  4: { grid: 'md:grid-cols-3', tiles: ['md:col-span-2 md:row-span-2', '', '', 'md:col-span-3'] },
  5: { grid: 'md:grid-cols-4', tiles: ['md:col-span-2 md:row-span-2', '', '', '', ''] },
};

/**
 * Where the projects are — Uttara, Bashundhara, Purbachal — because that is
 * the first thing a Dhaka buyer narrows by.
 */
export function AreaGrid({ cards }: { cards: PublicProjectCard[] }) {
  const tiles = areaTiles(cards).slice(0, 5);
  if (tiles.length < 2) return null;

  return (
    <div className={cn('mt-12 grid auto-rows-[200px] gap-4 md:auto-rows-[220px] md:gap-5', LAYOUT[tiles.length].grid)}>
      {tiles.map((t, i) => {
        const lead = t.projects[0];
        return (
          <Reveal key={t.area} delay={i * 90} className={cn('h-full', LAYOUT[tiles.length].tiles[i])}>
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
              <div className="absolute inset-0 bg-linear-to-t from-site-night/90 via-site-night/30 to-transparent transition-opacity duration-500 group-hover:opacity-95" />
              <span className="absolute top-4 right-4 grid size-10 place-items-center rounded-full bg-white/15 text-white backdrop-blur transition-[background-color,transform] duration-300 group-hover:rotate-45 group-hover:bg-site-primary">
                <ArrowUpRight className="size-5" />
              </span>
              <div className="absolute inset-x-0 bottom-0 p-6 text-white transition-transform duration-500 ease-site-out group-hover:-translate-y-1">
                <p className={cn('font-display font-semibold', i === 0 ? 'text-3xl' : 'text-2xl')}>{t.area}</p>
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
