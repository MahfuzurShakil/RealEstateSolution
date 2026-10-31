'use client';

import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, Building2, CheckCircle2, CircleUserRound, Globe, LayoutDashboard, type LucideIcon } from 'lucide-react';
import { HERO_IMAGE } from '@/components/public/stock-images';
import { publicContentRepository } from '@/lib/repositories/public/content.public.repository';
import { cn } from '@/lib/utils/cn';

/*
 * The first page of the demo: pick a portal. Both are one app on one database
 * (AGENTS.md), so whatever is entered in Admin shows on the Public site in the
 * same browser. Admin's topbar links back here and to the Public Portal.
 */

const PORTALS: {
  href: string;
  icon: LucideIcon;
  title: string;
  who: string;
  body: string;
  points: string[];
  tone: { card: string; icon: string; button: string; tick: string };
}[] = [
  {
    href: '/admin',
    icon: LayoutDashboard,
    title: 'Admin Portal',
    who: 'For the company team',
    body: 'Run the business: land, projects, sales and bookings, construction, payments and fund.',
    points: ['Land and project pipeline', 'Leads, bookings and collections', 'Site progress, purchases and payments'],
    tone: {
      card: 'hover:border-admin-400',
      icon: 'bg-admin-500 text-white',
      button: 'bg-admin-500 hover:bg-admin-600',
      tick: 'text-admin-500',
    },
  },
  {
    href: '/',
    icon: Globe,
    title: 'Public Portal',
    who: 'For buyers',
    body: 'The company website: projects on sale, live availability, prices, progress and contact.',
    points: ['Published projects only', 'Floor-wise availability and prices', 'Call and WhatsApp enquiries'],
    tone: {
      card: 'hover:border-site-primary',
      icon: 'bg-site-primary text-white',
      button: 'bg-site-primary hover:bg-site-primary-dark',
      tick: 'text-site-primary',
    },
  },
  {
    href: '/investor/login',
    icon: CircleUserRound,
    title: 'Customer Portal',
    who: 'For customers of type Investor',
    body: 'Share owners sign in to see their investments, pay installments online and download receipts.',
    points: ['Shares, ownership and value', 'Payment schedule and online payment', 'Receipts, documents and alerts'],
    tone: {
      card: 'hover:border-site-brass',
      icon: 'bg-site-night text-site-brass',
      button: 'bg-site-night hover:bg-site-night-deep',
      tick: 'text-site-brass-dark',
    },
  },
];

export default function PortalChooser() {
  const company = useLiveQuery(() => publicContentRepository.company(), []);

  return (
    <main className="relative flex min-h-screen items-center overflow-hidden bg-slate-950 px-4 py-16 text-white">
      <div aria-hidden className="absolute inset-0 bg-cover bg-center opacity-25" style={{ backgroundImage: `url(${HERO_IMAGE})` }} />
      <div aria-hidden className="absolute inset-0 bg-linear-to-b from-slate-950/60 via-slate-950/80 to-slate-950" />

      <div className="relative mx-auto w-full max-w-6xl">
        <div className="text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-white/10 backdrop-blur">
            <Building2 className="size-7" />
          </span>
          <h1 className="mt-6 text-3xl font-semibold md:text-5xl">{company?.company_name ?? 'Real Estate Developer Platform'}</h1>
          <p className="mt-3 text-lg text-white/70">Choose where you want to go</p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {PORTALS.map(({ href, icon: Icon, title, who, body, points, tone }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'group flex flex-col rounded-3xl border-2 border-transparent bg-white p-8 text-slate-900 shadow-2xl transition-all duration-300 hover:-translate-y-1',
                tone.card,
              )}
            >
              <div className="flex items-center gap-4">
                <span className={cn('grid size-14 place-items-center rounded-2xl', tone.icon)}>
                  <Icon className="size-7" />
                </span>
                <span>
                  <span className="block text-sm text-slate-500">{who}</span>
                  <span className="block text-2xl font-semibold">{title}</span>
                </span>
              </div>
              <p className="mt-5 text-slate-600">{body}</p>
              <ul className="mt-5 space-y-2.5">
                {points.map((p) => (
                  <li key={p} className="flex items-center gap-2.5 text-slate-700">
                    <CheckCircle2 className={cn('size-5 shrink-0', tone.tick)} /> {p}
                  </li>
                ))}
              </ul>
              <span
                className={cn(
                  'mt-8 flex items-center justify-center gap-2 rounded-full py-3 font-medium text-white transition-colors',
                  tone.button,
                )}
              >
                Open {title} <ArrowRight className="size-4.5 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-white/50">
          Both portals share one database — what you enter in Admin appears on the Public site in this browser.
        </p>
      </div>
    </main>
  );
}
