import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ProjectsBrowser } from '@/components/public/ProjectsBrowser';

export const metadata: Metadata = {
  title: 'Projects',
  description: 'Apartments, plots and land shares on sale, with live availability.',
};

/** The filters read the URL, so the browser sits under a Suspense boundary (useSearchParams). */
export default function ProjectsPage() {
  return (
    <Suspense>
      <ProjectsBrowser />
    </Suspense>
  );
}
