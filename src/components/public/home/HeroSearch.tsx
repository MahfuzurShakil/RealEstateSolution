'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MapPin, Search, Wallet } from 'lucide-react';
import type { ProjectType } from '@/lib/db/types';
import { PUBLIC_PRICE_BANDS, areaOf } from '@/lib/domain/public-portal';
import type { PublicProjectCard } from '@/lib/repositories/public/project.public.repository';
import { cn } from '@/lib/utils/cn';

/** What a buyer is looking for, and the project types behind each word. */
export const BUYER_KINDS: { key: string; label: string; types: ProjectType[] }[] = [
  { key: 'flat', label: 'Apartment', types: ['apartment', 'mixed'] },
  { key: 'plot', label: 'Plot', types: ['plot_development'] },
  { key: 'share', label: 'Land Share', types: ['land_share'] },
  { key: 'shop', label: 'Commercial', types: ['commercial'] },
];

/** The search card that hangs off the bottom of the hero; it opens the listing pre-filtered. */
export function HeroSearch({ cards }: { cards: PublicProjectCard[] }) {
  const router = useRouter();
  const kinds = BUYER_KINDS.filter((k) => cards.some((c) => k.types.includes(c.project_type)));
  const [kind, setKind] = useState<string | null>(null);
  const [area, setArea] = useState('');
  const [price, setPrice] = useState('');
  const active = kinds.find((k) => k.key === kind) ?? kinds[0];
  const areas = [
    ...new Set(
      cards
        .filter((c) => !active || active.types.includes(c.project_type))
        .map((c) => areaOf(c.location_summary))
        .filter((a): a is string => !!a),
    ),
  ].sort();

  const search = () => {
    const params = new URLSearchParams();
    active?.types.forEach((t) => params.append('type', t));
    if (area) params.set('area', area);
    if (price) params.set('price', price);
    router.push(`/projects?${params.toString()}`);
  };

  return (
    <div className="mx-auto max-w-5xl">
      {kinds.length > 1 && (
        <div className="inline-flex max-w-full flex-wrap gap-1 rounded-t-2xl bg-white p-2.5">
          {kinds.map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={() => {
                setKind(k.key);
                setArea('');
              }}
              className={cn(
                'rounded-xl px-5 py-2 text-[15px] font-medium transition-colors',
                active?.key === k.key ? 'bg-site-primary text-white' : 'text-site-ink hover:text-site-primary',
              )}
            >
              {k.label}
            </button>
          ))}
        </div>
      )}
      <div
        className={cn(
          'grid gap-4 bg-white p-5 shadow-2xl shadow-slate-900/15 md:grid-cols-[1fr_1fr_auto] md:items-end md:p-6',
          kinds.length > 1 ? 'rounded-2xl rounded-tl-none' : 'rounded-2xl',
        )}
      >
        <label className="block">
          <span className="mb-2 block text-sm font-medium">Area</span>
          <span className="flex items-center gap-2 rounded-xl bg-site-soft px-3 ring-site-primary/40 focus-within:ring-2">
            <MapPin className="size-4.5 text-site-primary" />
            <select
              value={area}
              onChange={(e) => setArea(e.target.value)}
              className="h-12 w-full bg-transparent text-[15px] outline-none"
            >
              <option value="">All areas</option>
              {areas.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </span>
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium">Budget</span>
          <span className="flex items-center gap-2 rounded-xl bg-site-soft px-3 ring-site-primary/40 focus-within:ring-2">
            <Wallet className="size-4.5 text-site-primary" />
            <select
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="h-12 w-full bg-transparent text-[15px] outline-none"
            >
              <option value="">Any budget</option>
              {PUBLIC_PRICE_BANDS.map((b) => (
                <option key={b.key} value={b.key}>
                  {b.label}
                </option>
              ))}
            </select>
          </span>
        </label>
        <button
          type="button"
          onClick={search}
          className="flex h-12 items-center justify-center gap-2 rounded-xl bg-site-primary px-8 text-[15px] font-medium text-white transition-colors hover:bg-site-primary-dark"
        >
          <Search className="size-4.5" /> Search
        </button>
      </div>
    </div>
  );
}
