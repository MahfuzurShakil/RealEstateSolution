'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MapPin, Search, Wallet } from 'lucide-react';
import type { ProjectType } from '@/lib/db/types';
import { PUBLIC_PRICE_BANDS, areaOf } from '@/lib/domain/public-portal';
import type { PublicProjectCard } from '@/lib/repositories/public/project.public.repository';
import { cn } from '@/lib/utils/cn';
import { en } from '../i18n/en';
import { Button } from '../ui/Button';

const t = en.home.search;

/** What a buyer is looking for, and the project types behind each word. */
export const BUYER_KINDS: { key: string; label: string; types: ProjectType[] }[] = [
  { key: 'flat', label: 'Apartment', types: ['apartment', 'mixed'] },
  { key: 'plot', label: 'Plot', types: ['plot_development'] },
  { key: 'share', label: 'Land Share', types: ['land_share'] },
  { key: 'shop', label: 'Commercial', types: ['commercial'] },
];

const UNDER_1CR = ['under_50l', '50l_1cr'];

/**
 * The search card that hangs off the bottom of the hero; it opens the listing
 * pre-filtered. A real form, so Enter searches. Only kinds, areas and quick
 * chips that have a live project are offered — no search ends empty.
 */
export function HeroSearch({ cards }: { cards: PublicProjectCard[] }) {
  const router = useRouter();
  const kinds = BUYER_KINDS.filter((k) => cards.some((c) => k.types.includes(c.project_type)));
  const [kind, setKind] = useState<string>('all');
  const [area, setArea] = useState('');
  const [price, setPrice] = useState('');
  const active = kinds.find((k) => k.key === kind) ?? null;
  const inKind = cards.filter((c) => !active || active.types.includes(c.project_type));
  const areas = [...new Set(inKind.map((c) => areaOf(c.location_summary)).filter((a): a is string => !!a))].sort();

  const quickAll: ({ label: string; href: string } | false)[] = [
    cards.some((c) => c.stage === 'ready') && { label: t.readyToMove, href: '/projects?stage=ready' },
    cards.some((c) => c.price_from != null && c.price_from < 10_000_000) && {
      label: t.underOneCrore,
      href: `/projects?${UNDER_1CR.map((b) => `price=${b}`).join('&')}`,
    },
    cards.some((c) => c.project_type === 'plot_development' || c.project_type === 'land_share') && {
      label: t.plots,
      href: '/projects?type=plot_development&type=land_share',
    },
  ];
  const quick = quickAll.filter((q): q is { label: string; href: string } => !!q);

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    active?.types.forEach((ty) => params.append('type', ty));
    if (area) params.set('area', area);
    if (price) params.set('price', price);
    const qs = params.toString();
    router.push(qs ? `/projects?${qs}` : '/projects');
  };

  const tabs = [{ key: 'all', label: 'All' }, ...kinds];
  const field = 'flex items-center gap-2 rounded-xl border border-site-line bg-site-ivory px-3 transition-colors focus-within:border-site-primary';

  return (
    <div className="mx-auto max-w-5xl">
      {kinds.length > 1 && (
        <div role="tablist" aria-label="Property type" className="inline-flex max-w-full flex-wrap gap-1 rounded-t-2xl bg-white p-2">
          {tabs.map((k) => (
            <button
              key={k.key}
              type="button"
              role="tab"
              aria-selected={kind === k.key}
              onClick={() => {
                setKind(k.key);
                setArea('');
              }}
              className={cn(
                'rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-200 sm:px-5',
                kind === k.key ? 'bg-site-primary text-white' : 'text-site-ink hover:text-site-primary',
              )}
            >
              {k.label}
            </button>
          ))}
        </div>
      )}
      <form
        onSubmit={search}
        className={cn(
          'grid gap-4 bg-white p-4 shadow-site-3 sm:p-5 md:grid-cols-[1fr_1fr_auto] md:items-end md:p-6',
          kinds.length > 1 ? 'rounded-2xl rounded-tl-none' : 'rounded-2xl',
        )}
      >
        <label className="block">
          <span className="mb-2 block text-sm font-semibold">{t.area}</span>
          <span className={field}>
            <MapPin className="size-4.5 text-site-primary" aria-hidden />
            <select value={area} onChange={(e) => setArea(e.target.value)} className="h-12 w-full bg-transparent text-[15px] outline-none">
              <option value="">{t.allAreas}</option>
              {areas.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </span>
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold">{t.budget}</span>
          <span className={field}>
            <Wallet className="size-4.5 text-site-primary" aria-hidden />
            <select value={price} onChange={(e) => setPrice(e.target.value)} className="h-12 w-full bg-transparent text-[15px] outline-none">
              <option value="">{t.anyBudget}</option>
              {PUBLIC_PRICE_BANDS.map((b) => (
                <option key={b.key} value={b.key}>
                  {b.label}
                </option>
              ))}
            </select>
          </span>
        </label>
        <Button type="submit" size="lg" icon={<Search className="size-4.5" />} className="h-12 w-full md:w-auto md:px-9">
          {t.submit}
        </Button>
        {quick.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 md:col-span-3">
            <span className="text-sm text-site-muted">{t.quick}</span>
            {quick.map((q) => (
              <Link
                key={q.href}
                href={q.href}
                className="rounded-full border border-site-line px-3.5 py-1.5 text-sm font-medium transition-colors hover:border-site-primary hover:text-site-primary"
              >
                {q.label}
              </Link>
            ))}
          </div>
        )}
      </form>
    </div>
  );
}
