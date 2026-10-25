import type { Metadata } from 'next';
import { ProjectDetail } from '@/components/public/detail/ProjectDetail';

export const metadata: Metadata = {
  title: 'Project details',
  description: 'Prices, availability, specification and progress of one project.',
};

/**
 * Public Portal P2 detail (v2.0 §3.5). The data lives in the browser's
 * IndexedDB in Phase A, so the page itself is a client component; this file
 * only unwraps the route's `code`.
 */
export default async function ProjectDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <ProjectDetail code={decodeURIComponent(code)} />;
}
