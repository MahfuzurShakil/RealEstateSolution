import type { Metadata } from 'next';
import { HistoryPage } from '@/components/investor/pages/HistoryPage';

export const metadata: Metadata = { title: 'Payment history' };

export default function InvestorHistoryPage() {
  return <HistoryPage />;
}
