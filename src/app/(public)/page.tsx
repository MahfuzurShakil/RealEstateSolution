'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowRight,
  CircleCheck,
  Globe2,
  MessageCircle,
  PhoneCall,
  Video,
  FileText,
  Banknote,
} from 'lucide-react';
import { ProjectCard, ProjectCardSkeleton } from '@/components/public/ProjectCard';
import { HERO_IMAGE, INTERIOR_IMAGE } from '@/components/public/stock-images';
import { useCompanyInfo } from '@/components/public/useCompanyInfo';
import { AreaGrid } from '@/components/public/home/AreaGrid';
import { BuyerFaq } from '@/components/public/home/BuyerFaq';
import { BuyingProcess } from '@/components/public/home/BuyingProcess';
import { HeroSearch, BUYER_KINDS } from '@/components/public/home/HeroSearch';
import { HeroSlider } from '@/components/public/home/HeroSlider';
import { InstalmentPlanner } from '@/components/public/home/InstalmentPlanner';
import { CountUp, Reveal } from '@/components/public/motion';
import { publicProjectRepository } from '@/lib/repositories/public/project.public.repository';
import { cn } from '@/lib/utils/cn';

/*
 * Home (Public Portal v2.0 §2.1). Layout ideas from the Hously template the
 * client picked, written here from scratch; the content follows how property
 * is bought from a developer in Bangladesh — by area, in Lakh and Crore, with
 * booking money, a sale agreement and instalments, then handover, deed and
 * mutation — including for buyers living abroad.
 */

function SectionTitle({ eyebrow, title, body, align = 'center' }: { eyebrow: string; title: string; body?: string; align?: 'center' | 'left' }) {
  return (
    <div className={cn('max-w-2xl', align === 'center' && 'mx-auto text-center')}>
      <p className="text-sm font-semibold tracking-[0.2em] text-site-primary uppercase">{eyebrow}</p>
      <h2 className="mt-3 text-3xl leading-tight font-semibold md:text-[42px]">{title}</h2>
      {body && <p className="mt-4 text-lg leading-relaxed text-site-muted">{body}</p>}
    </div>
  );
}

const WHY = [
  'Building plan approved before construction starts',
  'Land papers shown at the site office before you book',
  'Starting price and live availability on every project',
  'Construction photos published as the work goes on',
  'Every payment against a money receipt and a written agreement',
];

const NRB = [
  { icon: Video, title: 'Video walkthrough', body: 'See the site, the flat and the papers on a live video call.' },
  { icon: FileText, title: 'Documents by email', body: 'Agreement, receipts and progress reports sent to you.' },
  { icon: Banknote, title: 'Pay from abroad', body: 'Bank transfer from wherever you are, with a receipt each time.' },
  { icon: Globe2, title: 'Power of attorney', body: 'A family member can sign and register on your behalf.' },
];

export default function HomePage() {
  const company = useCompanyInfo();
  const cards = useLiveQuery(() => publicProjectRepository.list(), []);
  const [tab, setTab] = useState('all');

  const live = (cards ?? []).filter((c) => c.stage !== 'completed');
  const kinds = BUYER_KINDS.filter((k) => live.some((c) => k.types.includes(c.project_type)));
  const shown = live
    .filter((c) => tab === 'all' || BUYER_KINDS.find((k) => k.key === tab)?.types.includes(c.project_type))
    .slice(0, 6);

  const isLand = (t: string) => t === 'plot_development' || t === 'land_share';
  const stats = [
    { value: live.filter((c) => c.sales_badge === 'on_sale').length, label: 'Projects on sale' },
    { value: live.filter((c) => !isLand(c.project_type)).reduce((s, c) => s + c.available_count, 0), label: 'Flats & spaces available' },
    { value: live.filter((c) => isLand(c.project_type)).reduce((s, c) => s + c.available_count, 0), label: 'Plots & shares available' },
    { value: (cards ?? []).filter((c) => c.stage === 'completed').length, label: 'Projects completed' },
  ].filter((s) => s.value > 0);

  const flatPrices = live.filter((c) => !isLand(c.project_type) && c.price_from).map((c) => c.price_from!);
  const tel = company?.phone ? `tel:${company.phone.replace(/[^\d+]/g, '')}` : null;

  return (
    <>
      {cards === undefined ? (
        <section className="px-2 pt-2 md:px-4">
          <div className="min-h-[620px] animate-pulse rounded-3xl bg-site-night md:min-h-[700px]" />
        </section>
      ) : (
        <HeroSlider cards={live} companyName={company?.company_name ?? ''} tel={tel} />
      )}

      <section className="relative z-10 -mt-32 px-4 sm:px-6">
        {cards === undefined ? (
          <div className="mx-auto h-40 max-w-5xl animate-pulse rounded-2xl bg-white shadow-xl" />
        ) : (
          <HeroSearch cards={live} />
        )}
      </section>

      {stats.length > 0 && (
        <section className="mx-auto mt-16 max-w-6xl px-4 sm:px-6">
          <dl className="grid grid-cols-2 gap-y-8 md:grid-cols-4 md:divide-x md:divide-site-line">
            {stats.map((s) => (
              <div key={s.label} className="text-center">
                <dd className="text-4xl font-bold text-site-ink md:text-5xl">
                  <CountUp value={s.value} />
                </dd>
                <dt className="mt-1.5 text-site-muted">{s.label}</dt>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* projects on sale */}
      <section className="mx-auto mt-28 max-w-7xl px-4 sm:px-6">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionTitle
              align="left"
              eyebrow="Projects on sale"
              title="Homes and land you can book today"
              body="Availability comes straight from our sales desk — what you see here is still open."
            />
            {kinds.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {[{ key: 'all', label: 'All' }, ...kinds].map((k) => (
                  <button
                    key={k.key}
                    type="button"
                    onClick={() => setTab(k.key)}
                    className={cn(
                      'rounded-full px-5 py-2 text-[15px] font-medium transition-colors',
                      tab === k.key ? 'bg-site-primary text-white' : 'bg-site-soft text-site-ink hover:text-site-primary',
                    )}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Reveal>

        <div className="mt-12">
          {cards === undefined ? (
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <ProjectCardSkeleton key={i} />
              ))}
            </div>
          ) : shown.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-site-line px-6 py-14 text-center">
              <p className="text-xl font-medium">No projects on sale yet</p>
              <p className="mt-2 text-site-muted">New projects appear here as soon as they open for booking.</p>
            </div>
          ) : (
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((card, i) => (
                <Reveal key={card.code} delay={(i % 3) * 100}>
                  <ProjectCard card={card} />
                </Reveal>
              ))}
            </div>
          )}
        </div>
        {live.length > shown.length && (
          <div className="mt-12 text-center">
            <Link
              href="/projects"
              className="inline-flex items-center gap-2 rounded-full border border-site-primary px-7 py-3 font-medium text-site-primary transition-colors hover:bg-site-primary hover:text-white"
            >
              See all {live.length} projects <ArrowRight className="size-4" />
            </Link>
          </div>
        )}
      </section>

      {/* by area */}
      {live.length > 1 && (
        <section className="mx-auto mt-28 max-w-7xl px-4 sm:px-6">
          <Reveal>
            <SectionTitle
              eyebrow="Explore by area"
              title="Find a home where you want to live"
              body="Pick the area first, then the project — every tile shows how many are open and where prices start."
            />
          </Reveal>
          <AreaGrid cards={live} />
        </section>
      )}

      {/* how buying works */}
      <section className="mt-28 bg-site-soft py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal>
            <SectionTitle
              eyebrow="How buying works"
              title="From site visit to registration"
              body="The same steps for a flat, a plot or a land share — and our team is with you at each one."
            />
          </Reveal>
          <BuyingProcess />
        </div>
      </section>

      {/* payment planner */}
      <section className="mx-auto mt-28 max-w-7xl px-4 sm:px-6">
        <Reveal>
          <SectionTitle
            eyebrow="Plan your payments"
            title="What would a month cost?"
            body="Move the sliders to see booking money, down payment and monthly instalments for a flat."
          />
        </Reveal>
        <Reveal className="mt-12">
          <InstalmentPlanner startingPrice={flatPrices.length ? Math.min(...flatPrices) : null} />
        </Reveal>
      </section>

      {/* why us */}
      <section className="mx-auto mt-28 grid max-w-7xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2">
        <Reveal className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element -- remote stock photo */}
          <img src={INTERIOR_IMAGE} alt="A finished living room" className="aspect-4/3 w-full rounded-3xl object-cover shadow-xl" />
          <div className="absolute -bottom-8 left-6 flex items-center gap-4 rounded-2xl bg-white px-6 py-5 shadow-xl md:-right-8 md:left-auto">
            <span className="grid size-12 place-items-center rounded-full bg-site-primary-soft text-site-primary">
              <CircleCheck className="size-6" />
            </span>
            <span>
              <span className="block text-sm text-site-muted">Every taka</span>
              <span className="block text-lg font-semibold">against a receipt</span>
            </span>
          </div>
        </Reveal>
        <Reveal delay={120}>
          <SectionTitle
            align="left"
            eyebrow="Why buy with us"
            title="Clear papers. Honest prices. Peace of mind."
            body="A home is the biggest payment most families make. We keep every step on paper and in the open, so you always know where your money and your home stand."
          />
          <ul className="mt-8 space-y-4">
            {WHY.map((line) => (
              <li key={line} className="flex items-start gap-3 text-[17px]">
                <CircleCheck className="mt-0.5 size-5.5 shrink-0 text-site-primary" /> {line}
              </li>
            ))}
          </ul>
        </Reveal>
      </section>

      {/* NRB */}
      <section className="mx-auto mt-32 max-w-7xl px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl bg-site-night px-6 py-14 md:px-14">
          <div
            aria-hidden
            className="absolute inset-0 bg-cover bg-center opacity-15"
            style={{ backgroundImage: `url(${HERO_IMAGE})` }}
          />
          <div className="relative grid gap-12 lg:grid-cols-[1fr_1.4fr] lg:items-center">
            <Reveal>
              <p className="text-sm font-semibold tracking-[0.2em] text-site-primary uppercase">For buyers abroad</p>
              <h2 className="mt-3 text-3xl leading-tight font-semibold text-white md:text-[42px]">
                Living abroad? Buy a home back home.
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-white/70">
                Many of our buyers live in the Middle East, Europe and North America. You can choose, book and pay
                without flying in.
              </p>
            </Reveal>
            <div className="grid gap-4 sm:grid-cols-2">
              {NRB.map(({ icon: Icon, title, body }, i) => (
                <Reveal key={title} delay={i * 90}>
                  <div className="h-full rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
                    <Icon className="size-7 text-site-primary" strokeWidth={1.6} />
                    <p className="mt-4 text-lg font-medium text-white">{title}</p>
                    <p className="mt-1.5 text-white/65">{body}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ + contact */}
      <section className="mx-auto mt-28 grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_1.5fr]">
        <Reveal>
          <SectionTitle
            align="left"
            eyebrow="Questions buyers ask"
            title="Before you book"
            body="Still unsure about something? Call us or send a WhatsApp message — we reply the same day."
          />
          <div className="mt-8 flex flex-wrap gap-3">
            {tel && (
              <a
                href={tel}
                className="flex items-center gap-2 rounded-full bg-site-primary px-6 py-3 font-medium text-white transition-colors hover:bg-site-primary-dark"
              >
                <PhoneCall className="size-4.5" /> {company?.phone}
              </a>
            )}
            {company?.whatsapp_url && (
              <a
                href={company.whatsapp_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-full border border-site-line px-6 py-3 font-medium transition-colors hover:border-site-primary hover:text-site-primary"
              >
                <MessageCircle className="size-4.5" /> WhatsApp
              </a>
            )}
          </div>
        </Reveal>
        <Reveal delay={120}>
          <BuyerFaq />
        </Reveal>
      </section>
    </>
  );
}
