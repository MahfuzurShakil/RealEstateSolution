import type { Metadata } from 'next';
import { LegalPage } from '@/components/public/pages/LegalPage';

export const metadata: Metadata = { title: 'Terms of use' };

export default function Page() {
  return <LegalPage doc="terms" />;
}
