import type { ReactNode } from 'react';
import { Reveal } from '../motion';
import { Container, SectionHeader } from './SectionHeader';

/**
 * The top band of a content page (About, Contact, Buyer's guide, NRB, legal):
 * eyebrow + h1 with its serif accent + lead, on the sand background, with
 * optional actions underneath. Listing and detail pages have their own heads.
 */
export function PageHero({
  eyebrow,
  title,
  accent,
  lead,
  children,
}: {
  eyebrow: string;
  title: string;
  accent?: string;
  lead?: string;
  children?: ReactNode;
}) {
  return (
    <section className="bg-site-soft py-16 md:py-24">
      <Container>
        <Reveal>
          <SectionHeader as="h1" eyebrow={eyebrow} title={title} accent={accent} lead={lead} />
          {children && <div className="mt-8 flex flex-wrap gap-3">{children}</div>}
        </Reveal>
      </Container>
    </section>
  );
}
