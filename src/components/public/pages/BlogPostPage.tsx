'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Share2 } from 'lucide-react';
import { publicBlogRepository } from '@/lib/repositories/public/blog.public.repository';
import { BlogCard, postDate } from '../blog/BlogCard';
import { en } from '../i18n/en';
import { Reveal } from '../motion';
import { SiteImage } from '../SiteImage';
import { INTERIOR_IMAGE } from '../stock-images';
import { Container } from '../ui/SectionHeader';

const t = en.blog;

/**
 * /blog/[slug] (master plan §7.4): a reading-progress bar along the top,
 * share, the post, its pictures, and three more articles.
 */
export function BlogPostPage({ slug }: { slug: string }) {
  const post = useLiveQuery(() => publicBlogRepository.detail(slug), [slug]);
  const others = useLiveQuery(() => publicBlogRepository.list(4), []);
  const [progress, setProgress] = useState(0);
  const [copied, setCopied] = useState(false);
  const body = useRef<HTMLElement>(null);

  // how far through the article the reader is, from its top to its end
  useEffect(() => {
    const onScroll = () => {
      const el = body.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const total = r.height - window.innerHeight * 0.6;
      setProgress(total <= 0 ? 1 : Math.min(1, Math.max(0, -r.top / total)));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [post]);

  if (post === undefined) {
    return (
      <Container className="max-w-3xl space-y-6 py-16">
        <div className="h-10 w-2/3 animate-pulse rounded-xl bg-site-soft" />
        <div className="aspect-[16/9] animate-pulse rounded-[20px] bg-site-soft" />
      </Container>
    );
  }
  if (post === null) {
    return (
      <Container className="max-w-xl py-32 text-center">
        <h1 className="text-3xl font-semibold">{t.notFoundTitle}</h1>
        <p className="mt-3 text-site-muted">{t.notFoundBody}</p>
        <Link href="/blog" className="mt-8 inline-flex items-center gap-2 rounded-full bg-site-primary px-6 py-3 font-medium text-white">
          <ArrowLeft className="size-4" /> {t.back}
        </Link>
      </Container>
    );
  }

  const share = async () => {
    const data = { title: post.title, text: post.excerpt, url: window.location.href.split('?')[0] };
    if (navigator.share) await navigator.share(data).catch(() => {});
    else {
      await navigator.clipboard?.writeText(data.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  const related = (others ?? []).filter((p) => p.slug !== post.slug).slice(0, 3);

  return (
    <>
      <div
        role="progressbar"
        aria-label={t.progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        className="fixed inset-x-0 top-0 z-[55] h-1 origin-left bg-site-primary"
        style={{ transform: `scaleX(${progress})` }}
      />

      <article ref={body}>
        <Container className="max-w-3xl pt-10 md:pt-16">
          <Link href="/blog" className="inline-flex items-center gap-1.5 text-sm text-site-muted hover:text-site-primary">
            <ArrowLeft className="size-4" /> {t.back}
          </Link>
          <h1 className="mt-6 text-[34px] leading-tight font-semibold md:text-5xl">{post.title}</h1>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-site-muted">
            <p>
              {post.author && <>{t.by(post.author)} · </>}
              <time dateTime={post.published_at}>{postDate(post.published_at)}</time> · {t.minutes(post.reading_minutes)}
            </p>
            <button
              type="button"
              onClick={share}
              className="flex h-10 items-center gap-2 rounded-full border border-site-line bg-white px-4 text-sm font-semibold text-site-ink transition-colors hover:border-site-primary hover:text-site-primary"
            >
              <Share2 className="size-4" aria-hidden /> {copied ? t.copied : t.share}
            </button>
          </div>
        </Container>

        <Container className="mt-10 max-w-5xl">
          <SiteImage image={post.cover} fallback={INTERIOR_IMAGE} alt={post.title} eager className="aspect-[16/9] rounded-[24px]" />
        </Container>

        <Container className="mt-12 max-w-3xl">
          <p className="text-xl leading-relaxed font-medium">{post.excerpt}</p>
          <div className="mt-8 space-y-6 text-lg leading-[1.8] text-site-ink/90">
            {post.paragraphs.map((p, i) => (
              <p key={i} className="whitespace-pre-line">
                {p}
              </p>
            ))}
          </div>
          {post.images.length > 0 && (
            <div className="mt-12 grid gap-5 sm:grid-cols-2">
              {post.images.map((img, i) => (
                <SiteImage key={i} image={img} fallback={INTERIOR_IMAGE} alt={img.alt} className="aspect-[4/3] rounded-[20px]" />
              ))}
            </div>
          )}
        </Container>
      </article>

      {related.length > 0 && (
        <Container className="mt-24">
          <Reveal>
            <h2 className="text-2xl font-semibold md:text-[28px]">{t.related}</h2>
          </Reveal>
          <ul className="mt-8 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((p, i) => (
              <li key={p.slug}>
                <Reveal delay={i * 90} className="h-full">
                  <BlogCard post={p} />
                </Reveal>
              </li>
            ))}
          </ul>
        </Container>
      )}
    </>
  );
}
