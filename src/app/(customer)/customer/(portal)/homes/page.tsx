import type { Metadata } from 'next';
import { HomesPage } from '@/components/investor/pages/HomesPage';

export const metadata: Metadata = { title: 'My homes' };

export default function CustomerHomesPage() {
  return <HomesPage />;
}
