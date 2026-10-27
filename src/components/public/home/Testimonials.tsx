'use client';

import Link from 'next/link';
import { Quote, Star } from 'lucide-react';
import type { PublicTestimonial } from '@/lib/repositories/public/content.public.repository';
import { cn } from '@/lib/utils/cn';
import { en } from '../i18n/en';
import { Reveal } from '../motion';
import { Container, SectionHeader } from '../ui/SectionHeader';

const t = en.testimonials;

/*
 * Buyers' words (W7). Three columns on wide screens; on phones the cards sit
 * in a row that scrolls sideways with snap points, so the section stays one
 * screen tall however many there are. Hidden when nothing is published.
 */
export function Testimonials({ items, className }: { items: PublicTestimonial[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <Container className={className}>
      <Reveal>
        <SectionHeader eyebrow={t.eyebrow} title={t.title} accent={t.accent} lead={t.lead} align="center" />
      </Reveal>
      <ul
        className={cn(
          '-mx-4 mt-12 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6',
          'lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0',
        )}
      >
        {items.slice(0, 6).map((item, i) => (
          <li key={item.id} className="w-[85%] shrink-0 snap-start sm:w-[60%] lg:w-auto">
            <Reveal delay={(i % 3) * 90} className="h-full">
              <figure className="flex h-full flex-col rounded-[20px] border border-site-line bg-white p-6 shadow-site-1">
                <Quote className="size-8 text-site-brass" aria-hidden />
                {item.rating && (
                  <p className="mt-4 flex gap-0.5" role="img" aria-label={t.stars(item.rating)}>
                    {Array.from({ length: 5 }, (_, n) => (
                      <Star
                        key={n}
                        className={cn('size-4', n < item.rating! ? 'fill-site-brass text-site-brass' : 'text-site-line')}
                        aria-hidden
                      />
                    ))}
                  </p>
                )}
                <blockquote className="mt-4 flex-1 text-lg leading-relaxed">{item.quote}</blockquote>
                <figcaption className="mt-6 flex items-center gap-3 border-t border-site-line pt-5">
                  {item.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- any https host from Settings; next/image needs each one allowed
                    <img src={item.photo_url} alt="" className="size-11 rounded-full object-cover" loading="lazy" />
                  ) : (
                    <span className="font-display grid size-11 place-items-center rounded-full bg-site-primary-soft text-lg font-semibold text-site-primary">
                      {item.buyer_name.charAt(0)}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block font-semibold">{item.buyer_name}</span>
                    {(item.buyer_detail || item.project) && (
                      <span className="block truncate text-sm text-site-muted">
                        {item.project ? (
                          <Link href={`/projects/${encodeURIComponent(item.project.code)}`} className="hover:text-site-primary">
                            {item.buyer_detail ?? item.project.name}
                          </Link>
                        ) : (
                          item.buyer_detail
                        )}
                      </span>
                    )}
                  </span>
                </figcaption>
              </figure>
            </Reveal>
          </li>
        ))}
      </ul>
    </Container>
  );
}
