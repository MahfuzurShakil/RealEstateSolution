import type { Metadata } from 'next';
import { AboutPage } from '@/components/public/pages/AboutPage';

export const metadata: Metadata = {
  title: 'About us',
  description: 'Who we are, what we build and the promises we keep to every buyer.',
};

export default function Page() {
  return <AboutPage />;
}
