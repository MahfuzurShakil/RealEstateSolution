import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { PublicPostCard } from '@/lib/repositories/public/blog.public.repository';
import { cn } from '@/lib/utils/cn';
import { en } from '../i18n/en';
import { SiteImage } from '../SiteImage';
import { INTERIOR_IMAGE } from '../stock-images';

const t = en.blog;

export function postDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** A post in a list; `featured` lays it out wide, picture beside the text, from md up. */
export function BlogCard({ post, featured = false }: { post: PublicPostCard; featured?: boolean }) {
  return (
    <article className={cn('group h-full', featured && 'md:grid md:grid-cols-[1.3fr_1fr] md:items-center md:gap-10')}>
      <Link href={`/blog/${encodeURIComponent(post.slug)}`} className="block overflow-hidden rounded-[20px]" tabIndex={-1} aria-hidden>
        <SiteImage
          image={post.cover}
          fallback={INTERIOR_IMAGE}
          alt=""
          className={cn('aspect-[16/10] transition-transform duration-500 ease-site-out group-hover:scale-[1.03]', featured && 'md:aspect-[16/11]')}
        />
      </Link>
      <div className={cn('mt-5', featured && 'md:mt-0')}>
        <p className="text-sm text-site-muted">
          <time dateTime={post.published_at}>{postDate(post.published_at)}</time> · {t.minutes(post.reading_minutes)}
        </p>
        <h3 className={cn('mt-2 font-semibold leading-snug', featured ? 'text-2xl md:text-3xl' : 'text-xl')}>
          <Link href={`/blog/${encodeURIComponent(post.slug)}`} className="hover:text-site-primary">
            {post.title}
          </Link>
        </h3>
        <p className={cn('mt-3 text-site-muted', !featured && 'line-clamp-3')}>{post.excerpt}</p>
        <Link
          href={`/blog/${encodeURIComponent(post.slug)}`}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-site-primary"
          aria-label={`${t.readMore}: ${post.title}`}
        >
          {t.readMore} <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
        </Link>
      </div>
    </article>
  );
}
