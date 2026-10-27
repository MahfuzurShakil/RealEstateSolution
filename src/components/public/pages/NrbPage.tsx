'use client';

import { Banknote, CheckCircle2, FileSignature, PhoneCall, Video } from 'lucide-react';
import { useEnquiry } from '../enquiry/EnquiryProvider';
import { en } from '../i18n/en';
import { Reveal } from '../motion';
import { Button, ButtonLink } from '../ui/Button';
import { PageHero } from '../ui/PageHero';
import { Container, SectionHeader } from '../ui/SectionHeader';

/*
 * /nrb (master plan §7.4): buying from abroad. The callback form (any
 * country's number, best time at the buyer's own time zone) is the shared
 * enquiry modal; the video call goes through WhatsApp.
 */
const t = en.nrbPage;

export function NrbPage() {
  const enquiry = useEnquiry();
  const video = enquiry.whatsapp(null, en.home.nrb.whatsappText);

  return (
    <>
      <PageHero eyebrow={t.eyebrow} title={t.title} accent={t.accent} lead={t.lead}>
        <Button icon={<PhoneCall className="size-4.5" />} onClick={() => enquiry.open('callback')}>
          {t.cta}
        </Button>
        {video && (
          <ButtonLink href={video} variant="whatsapp" icon={<Video className="size-4.5" />}>
            {t.video}
          </ButtonLink>
        )}
      </PageHero>

      <Container className="mt-20">
        <Reveal>
          <SectionHeader title={t.stepsTitle} />
        </Reveal>
        <ol className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-5">
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

      <Container className="mt-20 grid gap-5 lg:grid-cols-2">
        <Reveal>
          <div className="h-full rounded-[20px] bg-site-soft p-6 md:p-8">
            <Banknote className="size-8 text-site-primary" strokeWidth={1.6} aria-hidden />
            <h2 className="mt-4 text-2xl font-semibold">{t.paymentTitle}</h2>
            <ul className="mt-5 space-y-3">
              {t.payment.map((line) => (
                <li key={line} className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-site-primary" aria-hidden /> {line}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
        <Reveal delay={100}>
          <div className="h-full rounded-[20px] bg-site-night p-6 text-white md:p-8">
            <FileSignature className="size-8 text-site-brass" strokeWidth={1.6} aria-hidden />
            <h2 className="mt-4 text-2xl font-semibold">{t.poaTitle}</h2>
            <p className="mt-4 text-white/75">{t.poa}</p>
            <Button variant="light" className="mt-8" icon={<PhoneCall className="size-4.5" />} onClick={() => enquiry.open('callback')}>
              {t.cta}
            </Button>
          </div>
        </Reveal>
      </Container>
    </>
  );
}
