import type { Metadata } from 'next';
import { BlogPostPage } from '@/components/public/pages/BlogPostPage';

export const metadata: Metadata = { title: 'Article' };

/** Posts live in the browser's IndexedDB in Phase A, so this file only unwraps the slug. */
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <BlogPostPage slug={decodeURIComponent(slug)} />;
}
