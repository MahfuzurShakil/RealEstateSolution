import type { Metadata } from 'next';
import { BlogListPage } from '@/components/public/pages/BlogListPage';

export const metadata: Metadata = {
  title: 'News & articles',
  description: 'Handovers, new projects and buying guides.',
};

export default function Page() {
  return <BlogListPage />;
}
