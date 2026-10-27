'use client';

import { useState, ViewTransition } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, Banknote, CircleCheck, FileText, Globe2, Mail, MessageCircle, PhoneCall, Video, type LucideIcon } from 'lucide-react';
import { en } from '@/components/public/i18n/en';
import { ProjectCard, ProjectCardSkeleton } from '@/components/public/ProjectCard';
import { HERO_IMAGE, INTERIOR_IMAGE } from '@/components/public/stock-images';
import { useCompanyInfo } from '@/components/public/useCompanyInfo';
import { AreaGrid, areaTiles } from '@/components/public/home/AreaGrid';
import { BuyerFaq } from '@/components/public/home/BuyerFaq';
import { BuyingProcess } from '@/components/public/home/BuyingProcess';
import { HeroSearch, BUYER_KINDS } from '@/components/public/home/HeroSearch';
import { HeroSlider } from '@/components/public/home/HeroSlider';
import { InstalmentPlanner } from '@/components/public/home/InstalmentPlanner';
import { SiteStrip } from '@/components/public/home/SiteStrip';
import { Testimonials } from '@/components/public/home/Testimonials';
import { publicContentRepository } from '@/lib/repositories/public/content.public.repository';
import { CountUp, Reveal } from '@/components/public/motion';
import { Button, ButtonLink } from '@/components/public/ui/Button';
import { useEnquiry } from '@/components/public/enquiry/EnquiryProvider';
import { Container, SectionHeader } from '@/components/public/ui/SectionHeader';
import { telLink, whatsappLink } from '@/lib/domain/public-portal';
import { publicProjectRepository } from '@/lib/repositories/public/project.public.repository';
import { cn } from '@/lib/utils/cn';

/*
 * Home (PUBLIC-WEBSITE-MASTER-PLAN.md §7.1). Section order: hero → search →
 * trust numbers → projects on sale → areas → live site photos → why us → testimonials →
 * buying steps → payment planner → buyers abroad → landowners → FAQ.
 * Every project fact comes from the public repositories; every word from
 * i18n/en.ts. Sections with no data hide themselves.
 */

const h = en.home;
const NRB_ICONS: LucideIcon[] = [Video, FileText, Banknote, Globe2];

export default function HomePage() {
  const company = useCompanyInfo();
  const cards = useLiveQuery(() => publicProjectRepository.list(), []);
  const testimonials = useLiveQuery(() => publicContentRepository.testimonials(), []);
  const faqs = useLiveQuery(() => publicContentRepository.faqs(), []);
  const [tab, setTab] = useState('all');
  const enquiry = useEnquiry();

  const live = (cards ?? []).filter((c) => c.stage !== 'completed');
  const kinds = BUYER_KINDS.filter((k) => live.some((c) => k.types.includes(c.project_type)));
  const shown = live.filter((c) => tab === 'all' || BUYER_KINDS.find((k) => k.key === tab)?.types.includes(c.project_type)).slice(0, 6);

  const isLand = (ty: string) => ty === 'plot_development' || ty === 'land_share';
  const stats = [
    { value: live.filter((c) => c.sales_badge === 'on_sale').length, label: h.stats.onSale },
    { value: live.filter((c) => !isLand(c.project_type)).reduce((s, c) => s + c.available_count, 0), label: h.stats.homes },
    { value: live.filter((c) => isLand(c.project_type)).reduce((s, c) => s + c.available_count, 0), label: h.stats.land },
    { value: (cards ?? []).filter((c) => c.stage === 'completed').length, label: h.stats.completed },
  ].filter((s) => s.value > 0);

  const flatPrices = live.filter((c) => !isLand(c.project_type) && c.price_from).map((c) => c.price_from!);
  const tel = telLink(company?.phone);
  const wa = (text: string) => (company?.whatsapp_number ? whatsappLink(company.whatsapp_number, text) : null);

  return (
    <>
      {cards === undefined ? (
        <section className="px-2 pt-2 md:px-4">
          <div className="min-h-[640px] animate-pulse rounded-[28px] bg-site-night md:min-h-[700px]" />
        </section>
      ) : (
        <HeroSlider cards={live} />
      )}

      <section className="relative z-10 -mt-44 px-4 sm:px-6 md:-mt-32">
        {cards === undefined ? <div className="mx-auto h-40 max-w-5xl animate-pulse rounded-2xl bg-white shadow-site-3" /> : <HeroSearch cards={live} showPrices={company?.show_prices !== false} />}
      </section>

      {/* trust numbers — columns follow how many there are, so no gap is left */}
      {stats.length > 0 && (
        <Container className="mt-16">
          <dl
            className={cn(
              'grid grid-cols-2 gap-y-8 rounded-[20px] border border-site-line bg-white px-4 py-8 shadow-site-1 md:divide-x md:divide-site-line md:py-10',
              stats.length === 3 && 'md:grid-cols-3',
              stats.length === 4 && 'md:grid-cols-4',
            )}
          >
            {stats.map((s) => (
              <div key={s.label} className="flex flex-col-reverse items-center text-center">
                <dt className="mt-1.5 text-sm text-site-muted md:text-base">{s.label}</dt>
                <dd className="font-display text-4xl font-semibold text-site-ink md:text-5xl">
                  <CountUp value={s.value} />
                </dd>
              </div>
            ))}
          </dl>
        </Container>
      )}

      {/* projects on sale */}
      <Container className="mt-24 md:mt-28">
        <Reveal>
          <SectionHeader
            eyebrow={h.projects.eyebrow}
            title={h.projects.title}
            accent={h.projects.accent}
            lead={h.projects.lead}
            action={
              kinds.length > 1 && (
                <div role="tablist" aria-label="Filter projects" className="flex flex-wrap gap-2">
                  {[{ key: 'all', label: h.projects.all }, ...kinds].map((k) => (
                    <button
                      key={k.key}
                      type="button"
                      role="tab"
                      aria-selected={tab === k.key}
                      onClick={() => setTab(k.key)}
                      className={cn(
                        'rounded-full px-5 py-2 text-sm font-semibold transition-colors duration-200',
                        tab === k.key ? 'bg-site-primary text-white' : 'border border-site-line bg-white hover:border-site-primary hover:text-site-primary',
                      )}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
              )
            }
          />
        </Reveal>

        <div className="mt-10 md:mt-12">
          {cards === undefined ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
              {[0, 1, 2].map((i) => (
                <ProjectCardSkeleton key={i} />
              ))}
            </div>
          ) : shown.length === 0 ? (
            <div className="rounded-[20px] border border-dashed border-site-line px-6 py-14 text-center">
              <p className="text-xl font-semibold">{h.projects.emptyTitle}</p>
              <p className="mt-2 text-site-muted">{h.projects.emptyBody}</p>
            </div>
          ) : (
            // same place, different content: the grid crossfades when the tab changes
            <ViewTransition key={tab} enter="auto" exit="auto" default="none">
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
                {shown.map((card, i) => (
                  <Reveal key={card.code} delay={(i % 3) * 80}>
                    <ProjectCard card={card} />
                  </Reveal>
                ))}
              </div>
            </ViewTransition>
          )}
        </div>
        {live.length > shown.length && (
          <div className="mt-12 text-center">
            <ButtonLink href="/projects" variant="outline" size="lg" iconRight={<ArrowRight className="size-4" />}>
              {h.projects.seeAll(live.length)}
            </ButtonLink>
          </div>
        )}
      </Container>

      {/* by area */}
      {areaTiles(live).length > 1 && (
        <Container className="mt-24 md:mt-28">
          <Reveal>
            <SectionHeader eyebrow={h.areas.eyebrow} title={h.areas.title} accent={h.areas.accent} lead={h.areas.lead} />
          </Reveal>
          <AreaGrid cards={live} />
        </Container>
      )}

      {/* live site photos */}
      <SiteStrip />

      {/* why us */}
      <Container className="mt-24 grid items-center gap-14 md:mt-28 lg:grid-cols-2">
        <Reveal className="relative pb-8 lg:pb-0">
          {/* eslint-disable-next-line @next/next/no-img-element -- remote stock photo */}
          <img src={INTERIOR_IMAGE} alt={h.why.imageAlt} className="aspect-4/3 w-full rounded-[28px] object-cover shadow-site-2" />
          {/* stays inside the column on every width (it used to push the page sideways on tablets) */}
          <div className="absolute bottom-0 left-4 flex items-center gap-4 rounded-2xl bg-white px-5 py-4 shadow-site-3 sm:left-6 lg:-bottom-6 lg:left-auto lg:right-6">
            <span className="grid size-12 place-items-center rounded-full bg-site-primary-soft text-site-primary">
              <CircleCheck className="size-6" aria-hidden />
            </span>
            <span>
              <span className="block text-sm text-site-muted">{h.why.badgeTop}</span>
              <span className="block text-lg font-semibold">{h.why.badgeBottom}</span>
            </span>
          </div>
        </Reveal>
        <Reveal delay={120}>
          <SectionHeader eyebrow={h.why.eyebrow} title={h.why.title} accent={h.why.accent} lead={h.why.lead} />
          <ul className="mt-8 space-y-4">
            {h.why.points.map((line) => (
              <li key={line} className="flex items-start gap-3 text-[17px]">
                <CircleCheck className="mt-0.5 size-5.5 shrink-0 text-site-primary" aria-hidden /> {line}
              </li>
            ))}
          </ul>
        </Reveal>
      </Container>

      {/* how buying works */}
      {/* buyers' words — hidden until Admin → Website content has one published */}
      <Testimonials items={testimonials ?? []} className="mt-24 md:mt-28" />

      <section className="mt-24 bg-site-soft py-20 md:mt-28 md:py-24">
        <Container>
          <Reveal>
            <SectionHeader eyebrow={h.steps.eyebrow} title={h.steps.title} accent={h.steps.accent} lead={h.steps.lead} align="center" />
          </Reveal>
          <BuyingProcess />
        </Container>
      </section>

      {/* payment planner */}
      <Container className="mt-24 md:mt-28">
        <Reveal>
          <SectionHeader eyebrow={h.planner.eyebrow} title={h.planner.title} accent={h.planner.accent} lead={h.planner.lead} align="center" />
        </Reveal>
        <Reveal className="mt-12">
          <InstalmentPlanner startingPrice={flatPrices.length ? Math.min(...flatPrices) : null} />
        </Reveal>
      </Container>

      {/* buyers abroad */}
      <Container className="mt-24 md:mt-32">
        <div className="relative overflow-hidden rounded-[28px] bg-site-night px-6 py-14 md:px-14">
          <div aria-hidden className="absolute inset-0 bg-cover bg-center opacity-15" style={{ backgroundImage: `url(${HERO_IMAGE})` }} />
          <div className="relative grid gap-12 lg:grid-cols-[1fr_1.4fr] lg:items-center">
            <Reveal>
              <SectionHeader tone="dark" eyebrow={h.nrb.eyebrow} title={h.nrb.title} accent={h.nrb.accent} lead={h.nrb.lead} />
              <div className="mt-8 flex flex-wrap gap-3">
                <Button variant="light" icon={<PhoneCall className="size-4.5" />} onClick={() => enquiry.open('callback')}>
                  {en.enquiry.cta.callback}
                </Button>
                {wa(h.nrb.whatsappText) && (
                  <ButtonLink href={wa(h.nrb.whatsappText)!} variant="onDark" icon={<Video className="size-4.5" />}>
                    {h.nrb.cta}
                  </ButtonLink>
                )}
              </div>
            </Reveal>
            <div className="grid gap-4 sm:grid-cols-2">
              {h.nrb.items.map(({ title, body }, i) => {
                const Icon = NRB_ICONS[i];
                return (
                  <Reveal key={title} delay={i * 90}>
                    <div className="h-full rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur transition-colors duration-300 hover:bg-white/10">
                      <Icon className="size-7 text-site-brass" strokeWidth={1.6} aria-hidden />
                      <p className="mt-4 text-lg font-semibold text-white">{title}</p>
                      <p className="mt-1.5 text-white/70">{body}</p>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </div>
      </Container>

      {/* landowners — talks to the sales team until the /landowners page is built (W8) */}
      {(wa(h.landowner.whatsappText) || tel) && (
        <Container className="mt-24 md:mt-28">
          <Reveal>
            <div className="flex flex-col items-start justify-between gap-8 rounded-[28px] border border-site-line bg-white p-8 shadow-site-1 md:flex-row md:items-center md:p-12">
              <SectionHeader eyebrow={h.landowner.eyebrow} title={h.landowner.title} accent={h.landowner.accent} lead={h.landowner.lead} />
              <ButtonLink
                href={wa(h.landowner.whatsappText) ?? tel!}
                size="lg"
                icon={wa(h.landowner.whatsappText) ? <MessageCircle className="size-4.5" /> : <PhoneCall className="size-4.5" />}
              >
                {h.landowner.cta}
              </ButtonLink>
            </div>
          </Reveal>
        </Container>
      )}

      {/* FAQ + contact */}
      <Container className="mt-24 grid gap-12 md:mt-28 lg:grid-cols-[1fr_1.5fr]">
        <Reveal>
          <SectionHeader eyebrow={h.faq.eyebrow} title={h.faq.title} accent={h.faq.accent} lead={h.faq.lead} />
          <div className="mt-8 flex flex-wrap gap-3">
            <Button icon={<Mail className="size-4.5" />} onClick={() => enquiry.open('enquiry')}>
              {en.enquiry.cta.message}
            </Button>
            {tel && (
              <ButtonLink href={tel} variant="outline" icon={<PhoneCall className="size-4.5" />}>
                <span className="tabular">{company?.phone}</span>
              </ButtonLink>
            )}
            {enquiry.whatsapp() && (
              <ButtonLink href={enquiry.whatsapp()!} variant="outline" icon={<MessageCircle className="size-4.5" />}>
                {en.nav.whatsapp}
              </ButtonLink>
            )}
          </div>
        </Reveal>
        <Reveal delay={120}>
          {faqs !== undefined && <BuyerFaq items={faqs.map((f) => ({ q: f.question, a: f.answer }))} />}
        </Reveal>
      </Container>
    </>
  );
}
