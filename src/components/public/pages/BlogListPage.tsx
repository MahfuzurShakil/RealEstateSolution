'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { publicBlogRepository } from '@/lib/repositories/public/blog.public.repository';
import { BlogCard } from '../blog/BlogCard';
import { en } from '../i18n/en';
import { Reveal } from '../motion';
import { PageHero } from '../ui/PageHero';
import { Container } from '../ui/SectionHeader';

const t = en.blog;

/** /blog (master plan §7.4): the newest post featured, the rest in a grid. */
export function BlogListPage() {
  const posts = useLiveQuery(() => publicBlogRepository.list(), []);
  const [first, ...rest] = posts ?? [];

  return (
    <>
      <PageHero eyebrow={t.eyebrow} title={t.title} accent={t.accent} lead={t.lead} />
      <Container className="mt-16">
        {posts === undefined ? (
          <div className="h-80 animate-pulse rounded-[20px] bg-site-soft" />
        ) : !first ? (
          <div className="rounded-[20px] border border-dashed border-site-line bg-white px-6 py-14 text-center">
            <p className="text-xl font-semibold">{t.emptyTitle}</p>
            <p className="mt-2 text-site-muted">{t.emptyBody}</p>
          </div>
        ) : (
          <>
            <Reveal>
              <BlogCard post={first} featured level={2} />
            </Reveal>
            {rest.length > 0 && (
              <ul className="mt-16 grid gap-x-8 gap-y-14 border-t border-site-line pt-14 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((p, i) => (
                  <li key={p.slug}>
                    <Reveal delay={(i % 3) * 90} className="h-full">
                      <BlogCard post={p} level={2} />
                    </Reveal>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Container>
    </>
  );
}
