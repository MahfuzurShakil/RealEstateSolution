'use client';

import { ArrowRight, CalendarCheck, Clock, Globe2, Mail, MapPin, MessageCircle, Navigation, PhoneCall, type LucideIcon } from 'lucide-react';
import { telLink } from '@/lib/domain/public-portal';
import { useEnquiry, type EnquiryKind } from '../enquiry/EnquiryProvider';
import { en } from '../i18n/en';
import { Reveal } from '../motion';
import { ButtonLink } from '../ui/Button';
import { PageHero } from '../ui/PageHero';
import { Container } from '../ui/SectionHeader';
import { useCompanyInfo } from '../useCompanyInfo';

/*
 * /contact (master plan §7.4). Everything comes from Settings → Company; a
 * blank field leaves its row out. The three ways in open the shared enquiry
 * modal, so a message sent here lands in Leads like any other.
 */
const t = en.contact;
const WAY_ICONS: Record<EnquiryKind, LucideIcon> = { enquiry: Mail, visit: CalendarCheck, callback: Globe2 };
const NETWORK: Record<string, string> = { facebook: 'Facebook', youtube: 'YouTube', instagram: 'Instagram', linkedin: 'LinkedIn' };

function Row({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 py-4">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-site-primary-soft text-site-primary">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-sm text-site-muted">{label}</p>
        <div className="font-medium break-words">{children}</div>
      </div>
    </div>
  );
}

export function ContactPage() {
  const company = useCompanyInfo();
  const enquiry = useEnquiry();
  const tel = telLink(company?.phone);
  const wa = enquiry.whatsapp();

  return (
    <>
      <PageHero eyebrow={t.eyebrow} title={t.title} accent={t.accent} lead={t.lead}>
        {tel && (
          <ButtonLink href={tel} icon={<PhoneCall className="size-4.5" />}>
            <span className="tabular">{company?.phone}</span>
          </ButtonLink>
        )}
        {wa && (
          <ButtonLink href={wa} variant="whatsapp" icon={<MessageCircle className="size-4.5" />}>
            {en.nav.whatsapp}
          </ButtonLink>
        )}
      </PageHero>

      <Container className="mt-16 grid gap-8 lg:grid-cols-[1fr_1.2fr] [&>*]:min-w-0">
        <Reveal>
          <div className="rounded-[20px] border border-site-line bg-white p-6 shadow-site-1 md:p-8">
            <h2 className="text-2xl font-semibold">{t.office}</h2>
            <div className="mt-2 divide-y divide-site-line">
              {company?.address && (
                <Row icon={MapPin} label={t.office}>
                  {company.address}
                </Row>
              )}
              {company?.office_hours && (
                <Row icon={Clock} label={t.hours}>
                  {company.office_hours}
                </Row>
              )}
              {tel && (
                <Row icon={PhoneCall} label={t.phone}>
                  <a href={tel} className="tabular hover:text-site-primary">
                    {company?.phone}
                  </a>
                </Row>
              )}
              {wa && (
                <Row icon={MessageCircle} label={t.whatsapp}>
                  <a href={wa} target="_blank" rel="noopener noreferrer" className="tabular hover:text-site-primary">
                    {company?.whatsapp_number}
                  </a>
                </Row>
              )}
              {company?.email && (
                <Row icon={Mail} label={t.email}>
                  <a href={`mailto:${company.email}`} className="break-all hover:text-site-primary">
                    {company.email}
                  </a>
                </Row>
              )}
            </div>
            {company?.office_map_url && (
              <ButtonLink href={company.office_map_url} variant="outline" className="mt-4" icon={<Navigation className="size-4" />}>
                {t.directions}
              </ButtonLink>
            )}
            {company && company.social.length > 0 && (
              <div className="mt-8 border-t border-site-line pt-6">
                <p className="text-sm text-site-muted">{t.follow}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {company.social.map((s) => (
                    <a
                      key={s.network}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full border border-site-line px-4 py-2 text-sm font-semibold hover:border-site-primary hover:text-site-primary"
                    >
                      {NETWORK[s.network]}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Reveal>

        <div className="grid content-start gap-4">
          {t.ways.map((w, i) => {
            const kind = w.key as EnquiryKind;
            const Icon = WAY_ICONS[kind];
            return (
              <Reveal key={w.key} delay={i * 90}>
                <button
                  type="button"
                  onClick={() => enquiry.open(kind)}
                  className="group flex w-full items-center gap-5 rounded-[20px] border border-site-line bg-white p-6 text-left transition-[box-shadow,transform,border-color] duration-300 hover:-translate-y-0.5 hover:border-site-primary hover:shadow-site-2"
                >
                  <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-site-primary text-white">
                    <Icon className="size-6" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-lg font-semibold">{w.title}</span>
                    <span className="mt-1 block text-site-muted">{w.body}</span>
                  </span>
                  <ArrowRight className="size-5 shrink-0 text-site-faint transition-transform group-hover:translate-x-1 group-hover:text-site-primary" aria-label={t.open} />
                </button>
              </Reveal>
            );
          })}
        </div>
      </Container>
    </>
  );
}
