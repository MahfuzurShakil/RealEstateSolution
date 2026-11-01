'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { CircleUserRound, Sparkles } from 'lucide-react';
import { OpportunityCard } from '@/components/investor/OpportunityCard';
import { publicShareOfferRepository } from '@/lib/repositories/public/share-offer.public.repository';
import { en } from '../i18n/en';
import { Reveal } from '../motion';
import { ButtonLink } from '../ui/Button';
import { PageHero } from '../ui/PageHero';
import { Container, SectionHeader } from '../ui/SectionHeader';
import { useCompanyInfo } from '../useCompanyInfo';

/*
 * /invest (BUYER-PORTAL-PLAN.md §6): the open Share Sale offerings, as the
 * same cards the Customer Portal shows, with a request a visitor can send
 * without an account. The page and its menu item exist only while Settings →
 * Website "Show share offerings on the website" is on.
 */
const t = en.investPage;

export function InvestPage() {
  const company = useCompanyInfo();
  const offers = useLiveQuery(() => publicShareOfferRepository.openOffers(), []);

  if (company && !company.show_share_sale) {
    return (
      <Container className="py-28 text-center">
        <p className="text-lg text-site-muted">{t.none}</p>
      </Container>
    );
  }

  return (
    <>
      <PageHero eyebrow={t.eyebrow} title={t.title} accent={t.accent} lead={t.lead}>
        <ButtonLink href="/customer/login" variant="outline" icon={<CircleUserRound className="size-4.5" />}>
          {t.signIn}
        </ButtonLink>
      </PageHero>

      <Container className="mt-20">
        <Reveal>
          <SectionHeader title={t.offersTitle} lead={t.offersLead} />
        </Reveal>
        {offers === undefined ? null : offers.length === 0 ? (
          <p className="mt-10 flex items-center gap-3 rounded-[20px] border border-site-line bg-white p-6 text-site-muted">
            <Sparkles className="size-5 shrink-0 text-site-primary" aria-hidden /> {t.none}
          </p>
        ) : (
          <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {offers.map(({ round, project }) => (
              <OpportunityCard key={round.code} round={round} project={project} owned={false} request={undefined} visitor />
            ))}
          </div>
        )}
      </Container>

      <Container className="mt-20 mb-24">
        <Reveal>
          <SectionHeader title={t.stepsTitle} />
        </Reveal>
        <ol className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {t.steps.map((s, i) => (
            <li key={s.title}>
              <Reveal delay={i * 80} className="h-full rounded-[20px] border border-site-line bg-white p-6">
                <span className="font-display tabular grid size-10 place-items-center rounded-full bg-site-primary text-lg font-bold text-white">{i + 1}</span>
                <p className="mt-5 text-lg font-semibold">{s.title}</p>
                <p className="mt-2 text-site-muted">{s.body}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </Container>
    </>
  );
}
