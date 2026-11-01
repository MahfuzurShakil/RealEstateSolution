import type { Metadata } from 'next';
import { InvestmentsPage } from '@/components/investor/pages/InvestmentsPage';

export const metadata: Metadata = { title: 'My investments' };

export default function InvestorInvestmentsPage() {
  return <InvestmentsPage />;
}
