'use client';

import Link from 'next/link';
import { en } from '../i18n/en';
import { Container } from '../ui/SectionHeader';
import { useCompanyInfo } from '../useCompanyInfo';

/** /privacy and /terms: plain reading pages; the company is named from Settings, never in code. */
export function LegalPage({ doc }: { doc: 'privacy' | 'terms' }) {
  const company = useCompanyInfo();
  const t = en.legal[doc];

  return (
    <Container className="max-w-3xl py-16 md:py-24">
      <h1 className="text-[34px] leading-tight font-semibold md:text-5xl">{t.title}</h1>
      {company && <p className="mt-3 text-site-muted">{company.company_name}</p>}
      <div className="mt-10 space-y-8">
        {t.sections.map((s) => (
          <section key={s.h}>
            <h2 className="text-xl font-semibold">{s.h}</h2>
            <p className="mt-2 text-lg leading-relaxed text-site-muted">{s.p}</p>
          </section>
        ))}
      </div>
      <p className="mt-12 border-t border-site-line pt-6 text-site-muted">
        {en.legal.updated}{' '}
        <Link href="/contact" className="font-semibold text-site-primary hover:underline">
          {en.nav.contact}
        </Link>
      </p>
    </Container>
  );
}
