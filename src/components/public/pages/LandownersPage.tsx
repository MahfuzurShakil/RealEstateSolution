'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDown, CheckCircle2, FileSearch, FileSignature, HardHat, LineChart, MessageCircle, type LucideIcon } from 'lucide-react';
import { publicProjectRepository } from '@/lib/repositories/public/project.public.repository';
import { useEnquiry } from '../enquiry/EnquiryProvider';
import { BuyerFaq } from '../home/BuyerFaq';
import { en } from '../i18n/en';
import { LandOfferForm } from '../landowners/LandOfferForm';
import { Reveal } from '../motion';
import { ProjectCard } from '../ProjectCard';
import { ButtonLink } from '../ui/Button';
import { PageHero } from '../ui/PageHero';
import { Container, SectionHeader } from '../ui/SectionHeader';

/*
 * /landowners (master plan §7.4, W8): why develop with us, how a joint
 * venture works, what the owner receives, what we have built, questions,
 * and the offer form. "What we have built" shows public project cards only —
 * how each project's land was acquired is internal and never shown.
 */
const t = en.landowners;
const WHY_ICONS: LucideIcon[] = [FileSearch, FileSignature, HardHat, LineChart];

export function LandownersPage() {
  const enquiry = useEnquiry();
  const cards = useLiveQuery(() => publicProjectRepository.list(), []);
  const shown = (cards ?? []).slice(0, 3);
  const wa = enquiry.whatsapp(null, en.home.landowner.whatsappText);

  return (
    <>
      <PageHero eyebrow={t.eyebrow} title={t.title} accent={t.accent} lead={t.lead}>
        <ButtonLink href="#offer" icon={<ArrowDown className="size-4.5" />}>
          {t.offerCta}
        </ButtonLink>
        {wa && (
          <ButtonLink href={wa} variant="whatsapp" icon={<MessageCircle className="size-4.5" />}>
            {en.nav.whatsapp}
          </ButtonLink>
        )}
      </PageHero>

      <Container className="mt-20">
        <Reveal>
          <SectionHeader title={t.whyTitle} />
        </Reveal>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {t.why.map((w, i) => {
            const Icon = WHY_ICONS[i];
            return (
              <Reveal key={w.title} delay={i * 80}>
                <div className="h-full rounded-[20px] border border-site-line bg-white p-6">
                  <span className="grid size-12 place-items-center rounded-xl bg-site-primary-soft text-site-primary">
                    <Icon className="size-6" aria-hidden />
                  </span>
                  <p className="mt-5 text-lg font-semibold">{w.title}</p>
                  <p className="mt-2 text-site-muted">{w.body}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </Container>

      <section className="mt-24 bg-site-soft py-20">
        <Container>
          <Reveal>
            <SectionHeader title={t.stepsTitle} />
          </Reveal>
          <ol className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-5">
            {t.steps.map((s, i) => (
              <li key={s.title}>
                <Reveal delay={i * 80} className="h-full rounded-[20px] bg-white p-6 shadow-site-1">
                  <span className="font-display tabular grid size-10 place-items-center rounded-full bg-site-primary text-lg font-bold text-white">{i + 1}</span>
                  <p className="mt-5 text-lg font-semibold">{s.title}</p>
                  <p className="mt-2 text-site-muted">{s.body}</p>
                </Reveal>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <Container className="mt-24 grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:items-start">
        <Reveal>
          <SectionHeader title={t.receiveTitle} />
          <ul className="mt-8 space-y-4">
            {t.receive.map((line) => (
              <li key={line} className="flex items-start gap-3 text-lg">
                <CheckCircle2 className="mt-1 size-5 shrink-0 text-site-primary" aria-hidden /> {line}
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={120} className="min-w-0">
          <BuyerFaq items={t.faq} />
        </Reveal>
      </Container>

      {shown.length > 0 && (
        <Container className="mt-24">
          <Reveal>
            <SectionHeader title={t.projectsTitle} />
          </Reveal>
          <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((c, i) => (
              <Reveal key={c.code} delay={i * 100}>
                <ProjectCard card={c} />
              </Reveal>
            ))}
          </div>
        </Container>
      )}

      <Container className="mt-24 max-w-4xl scroll-mt-28" >
        <div id="offer" className="scroll-mt-28">
          <LandOfferForm />
        </div>
      </Container>
    </>
  );
}
