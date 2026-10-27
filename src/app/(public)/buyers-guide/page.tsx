import type { Metadata } from 'next';
import { GuidePage } from '@/components/public/pages/GuidePage';

export const metadata: Metadata = {
  title: 'Buyer’s guide',
  description: 'How buying a flat, plot or land share works: steps, papers to check, costs and instalments.',
};

export default function Page() {
  return <GuidePage />;
}
