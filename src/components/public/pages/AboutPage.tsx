'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { Award as AwardIcon, BadgeCheck, CalendarCheck, Camera, FileCheck2, HandCoins, ReceiptText, type LucideIcon } from 'lucide-react';
import { publicContentRepository } from '@/lib/repositories/public/content.public.repository';
import { publicProjectRepository } from '@/lib/repositories/public/project.public.repository';
import { cn } from '@/lib/utils/cn';
import { useEnquiry } from '../enquiry/EnquiryProvider';
import { en } from '../i18n/en';
import { CountUp, Reveal } from '../motion';
import { INTERIOR_IMAGE } from '../stock-images';
import { Button, ButtonLink } from '../ui/Button';
import { PageHero } from '../ui/PageHero';
import { Container, SectionHeader } from '../ui/SectionHeader';
import { useCompanyInfo } from '../useCompanyInfo';

/*
 * /about (master plan §7.4, Public Portal v2.0 §2.1). The story is the
 * Website card's "About the company" text; the numbers come from the public
 * project repository; the four promises are fixed copy. Each part hides
 * when it has nothing to say.
 */
const t = en.about;
const VALUE_ICONS: LucideIcon[] = [FileCheck2, HandCoins, Camera, ReceiptText];

export function AboutPage() {
  const company = useCompanyInfo();
  const cards = useLiveQuery(() => publicProjectRepository.list(), []);
  const enquiry = useEnquiry();
  const team = useLiveQuery(() => publicContentRepository.team(), []);
  const awards = useLiveQuery(() => publicContentRepository.awards(), []);

  const live = (cards ?? []).filter((c) => c.stage !== 'completed');
  const years = company?.established_year ? new Date().getFullYear() - company.established_year : 0;
  const numbers = [
    { value: years, label: t.numbers.years },
    { value: live.filter((c) => c.sales_badge === 'on_sale').length, label: t.numbers.onSale },
    { value: (cards ?? []).filter((c) => c.stage === 'completed').length, label: t.numbers.completed },
    { value: live.reduce((s, c) => s + c.available_count, 0), label: t.numbers.available },
  ].filter((n) => n.value > 0);
  const trust = [
    company?.rehab_member_no && t.rehab(company.rehab_member_no),
    company?.trade_license_no && t.licence(company.trade_license_no),
  ].filter((x): x is string => !!x);

  return (
    <>
      <PageHero
        eyebrow={company?.established_year ? t.since(company.established_year) : t.eyebrow}
        title={t.title}
        accent={t.accent}
        lead={company?.tagline ?? t.lead}
      />

      {company && company.about_paragraphs.length > 0 && (
        <Container className="mt-20 grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <Reveal>
            <h2 className="text-[28px] font-semibold md:text-4xl">{t.story}</h2>
            <div className="mt-6 space-y-5 text-lg leading-relaxed text-site-muted">
              {company.about_paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div
              role="img"
              aria-label={en.home.why.imageAlt}
              className="aspect-[4/3] rounded-[28px] bg-cover bg-center shadow-site-2"
              style={{ backgroundImage: `url(${INTERIOR_IMAGE})` }}
            />
          </Reveal>
        </Container>
      )}

      {numbers.length > 0 && (
        <Container className="mt-20">
          <dl
            className={cn(
              'grid grid-cols-2 gap-y-8 rounded-[20px] border border-site-line bg-white px-4 py-8 shadow-site-1 md:divide-x md:divide-site-line md:py-10',
              numbers.length === 3 && 'md:grid-cols-3',
              numbers.length === 4 && 'md:grid-cols-4',
            )}
          >
            {numbers.map((n) => (
              <div key={n.label} className="flex flex-col-reverse items-center px-4 text-center">
                <dt className="mt-1.5 text-sm text-site-muted md:text-base">{n.label}</dt>
                <dd className="font-display tabular text-4xl font-semibold text-site-ink md:text-5xl">
                  <CountUp value={n.value} />
                </dd>
              </div>
            ))}
          </dl>
        </Container>
      )}

      <section className="mt-24 bg-site-soft py-20">
        <Container>
          <Reveal>
            <SectionHeader eyebrow={t.valuesEyebrow} title={t.valuesTitle} accent={t.valuesAccent} align="center" />
          </Reveal>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {t.values.map((v, i) => {
              const Icon = VALUE_ICONS[i];
              return (
                <Reveal key={v.title} delay={i * 90}>
                  <div className="h-full rounded-[20px] bg-white p-6 shadow-site-1">
                    <span className="grid size-12 place-items-center rounded-xl bg-site-primary-soft text-site-primary">
                      <Icon className="size-6" aria-hidden />
                    </span>
                    <p className="mt-5 text-lg font-semibold">{v.title}</p>
                    <p className="mt-2 text-site-muted">{v.body}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
          {trust.length > 0 && (
            <div className="mt-12 text-center">
              <p className="text-xs font-semibold tracking-[0.18em] text-site-brass-dark uppercase">{t.trust}</p>
              <ul className="mt-4 flex flex-wrap justify-center gap-3">
                {trust.map((x) => (
                  <li key={x} className="tabular flex items-center gap-2 rounded-full border border-site-line bg-white px-4 py-2 text-sm font-medium">
                    <BadgeCheck className="size-4 text-site-primary" aria-hidden /> {x}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Container>
      </section>

      {team && team.length > 0 && (
        <Container className="mt-24">
          <Reveal>
            <SectionHeader eyebrow={en.team.eyebrow} title={en.team.title} accent={en.team.accent} />
          </Reveal>
          <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {team.map((m, i) => (
              <li key={m.id}>
                <Reveal delay={(i % 4) * 80}>
                  {m.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- any https host from Admin; next/image needs each one allowed
                    <img src={m.photo_url} alt={m.name} loading="lazy" className="aspect-[4/5] w-full rounded-[20px] object-cover" />
                  ) : (
                    <div aria-hidden className="font-display grid aspect-[4/5] w-full place-items-center rounded-[20px] bg-site-soft text-6xl font-semibold text-site-primary">
                      {m.name.charAt(0)}
                    </div>
                  )}
                  <p className="mt-4 text-lg font-semibold">{m.name}</p>
                  <p className="text-site-primary">{m.title}</p>
                  {m.bio && <p className="mt-2 text-sm leading-relaxed text-site-muted">{m.bio}</p>}
                </Reveal>
              </li>
            ))}
          </ul>
        </Container>
      )}

      {awards && awards.length > 0 && (
        <Container className="mt-24">
          <Reveal>
            <SectionHeader eyebrow={en.awards.eyebrow} title={en.awards.title} accent={en.awards.accent} />
          </Reveal>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {awards.map((a, i) => (
              <li key={a.id}>
                <Reveal delay={(i % 3) * 80} className="flex h-full gap-4 rounded-[20px] border border-site-line bg-white p-5">
                  <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-site-primary-soft text-site-primary">
                    <AwardIcon className="size-6" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold tracking-[0.14em] text-site-brass-dark uppercase">
                      {en.awards.kinds[a.kind]}
                      {a.year ? ` · ${a.year}` : ''}
                    </span>
                    <span className="mt-1 block font-semibold">{a.title}</span>
                    {a.issuer && <span className="block text-sm text-site-muted">{a.issuer}</span>}
                  </span>
                </Reveal>
              </li>
            ))}
          </ul>
        </Container>
      )}

      <Container className="mt-24">
        <Reveal>
          <div className="flex flex-col items-start justify-between gap-6 rounded-[28px] bg-site-night p-8 md:flex-row md:items-center md:p-12">
            <div>
              <p className="text-2xl font-semibold text-white md:text-3xl">{t.ctaTitle}</p>
              <p className="mt-2 text-white/70">{t.ctaBody}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" icon={<CalendarCheck className="size-4.5" />} onClick={() => enquiry.open('visit')}>
                {en.enquiry.cta.visit}
              </Button>
              <ButtonLink href="/projects" size="lg" variant="onDark">
                {en.nav.allProjects}
              </ButtonLink>
            </div>
          </div>
        </Reveal>
      </Container>
    </>
  );
}
