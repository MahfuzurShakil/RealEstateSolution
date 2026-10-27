import type { Metadata } from 'next';
import { LegalPage } from '@/components/public/pages/LegalPage';

export const metadata: Metadata = { title: 'Privacy policy' };

export default function Page() {
  return <LegalPage doc="privacy" />;
}
