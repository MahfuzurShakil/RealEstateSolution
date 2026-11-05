import type { Metadata } from 'next';
import { EarningsPage } from '@/components/investor/pages/EarningsPage';

export const metadata: Metadata = { title: 'My earnings' };

export default function InvestorEarningsPage() {
  return <EarningsPage />;
}
