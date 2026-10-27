'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarCheck, CheckCircle2, Receipt } from 'lucide-react';
import { publicProjectRepository } from '@/lib/repositories/public/project.public.repository';
import { useEnquiry } from '../enquiry/EnquiryProvider';
import { BuyerFaq } from '../home/BuyerFaq';
import { BuyingProcess } from '../home/BuyingProcess';
import { InstalmentPlanner } from '../home/InstalmentPlanner';
import { en } from '../i18n/en';
import { Reveal } from '../motion';
import { Button, ButtonLink } from '../ui/Button';
import { PageHero } from '../ui/PageHero';
import { Container, SectionHeader } from '../ui/SectionHeader';

/*
 * /buyers-guide (master plan §7.4): the steps, the papers by project shape,
 * the government charges besides the price (named, not quoted — rates change
 * and depend on the area), the instalment calculator and the full FAQ.
 */
const t = en.guide;
const PAPER_KINDS = ['tower', 'block', 'none'] as const;

export function GuidePage() {
  const enquiry = useEnquiry();
  const cards = useLiveQuery(() => publicProjectRepository.list(), []);
  const flatPrices = (cards ?? [])
    .filter((c) => c.stage !== 'completed' && c.project_type !== 'plot_development' && c.project_type !== 'land_share' && c.price_from)
    .map((c) => c.price_from!);

  const toc = Object.entries(t.toc) as [keyof typeof t.toc, string][];

  return (
    <>
      <PageHero eyebrow={t.eyebrow} title={t.title} accent={t.accent} lead={t.lead}>
        <nav aria-label={t.eyebrow} className="flex flex-wrap gap-2">
          {toc.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="rounded-full border border-site-line bg-white px-4 py-2 text-sm font-semibold hover:border-site-primary hover:text-site-primary">
              {label}
            </a>
          ))}
        </nav>
      </PageHero>

      <Container className="mt-20 scroll-mt-28" >
        <section id="steps" className="scroll-mt-28">
          <Reveal>
            <SectionHeader eyebrow={en.home.steps.eyebrow} title={en.home.steps.title} accent={en.home.steps.accent} lead={en.home.steps.lead} />
          </Reveal>
          <BuyingProcess />
        </section>
      </Container>

      <section id="papers" className="mt-24 scroll-mt-28 bg-site-soft py-20">
        <Container>
          <Reveal>
            <SectionHeader title={t.papersTitle} lead={t.papersLead} />
          </Reveal>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {PAPER_KINDS.map((kind, i) => (
              <Reveal key={kind} delay={i * 90}>
                <div className="h-full rounded-[20px] bg-white p-6 shadow-site-1">
                  <p className="text-lg font-semibold">{t.papersGroups[kind]}</p>
                  <ul className="mt-4 space-y-3">
                    {en.detail.papers[kind].map((line) => (
                      <li key={line} className="flex items-start gap-2.5">
                        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-site-primary" aria-hidden /> {line}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      <Container className="mt-24">
        <section id="costs" className="scroll-mt-28">
          <Reveal>
            <SectionHeader title={t.costsTitle} lead={t.costsLead} />
          </Reveal>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {t.costs.map((c, i) => (
              <Reveal key={c.title} delay={(i % 3) * 80}>
                <div className="flex h-full gap-4 rounded-[20px] border border-site-line bg-white p-5">
                  <Receipt className="mt-0.5 size-5 shrink-0 text-site-primary" aria-hidden />
                  <div>
                    <p className="font-semibold">{c.title}</p>
                    <p className="mt-1 text-site-muted">{c.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <section id="planner" className="mt-24 scroll-mt-28">
          <Reveal>
            <SectionHeader eyebrow={en.home.planner.eyebrow} title={t.plannerTitle} lead={en.home.planner.lead} />
          </Reveal>
          <Reveal className="mt-10">
            <InstalmentPlanner startingPrice={flatPrices.length ? Math.min(...flatPrices) : null} />
          </Reveal>
        </section>

        <section id="faq" className="mt-24 grid scroll-mt-28 gap-10 lg:grid-cols-[1fr_1.5fr]">
          <Reveal>
            <SectionHeader eyebrow={en.home.faq.eyebrow} title={t.faqTitle} lead={en.home.faq.lead} />
          </Reveal>
          <Reveal delay={120}>
            <BuyerFaq />
          </Reveal>
        </section>

        <Reveal className="mt-24">
          <div className="flex flex-col items-start justify-between gap-6 rounded-[28px] bg-site-night p-8 md:flex-row md:items-center md:p-12">
            <div>
              <p className="text-2xl font-semibold text-white md:text-3xl">{t.ctaTitle}</p>
              <p className="mt-2 text-white/70">{t.ctaBody}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" icon={<CalendarCheck className="size-4.5" />} onClick={() => enquiry.open('visit')}>
                {en.enquiry.cta.visit}
              </Button>
              <ButtonLink href="/nrb" size="lg" variant="onDark">
                {en.nav.nrb}
              </ButtonLink>
            </div>
          </div>
        </Reveal>
      </Container>
    </>
  );
}
