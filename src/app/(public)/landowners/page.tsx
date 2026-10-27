import type { Metadata } from 'next';
import { LandownersPage } from '@/components/public/pages/LandownersPage';

export const metadata: Metadata = {
  title: 'For landowners',
  description: 'Develop your land with us: your papers checked first, your share written into the agreement, approvals and construction handled.',
};

export default function Page() {
  return <LandownersPage />;
}
