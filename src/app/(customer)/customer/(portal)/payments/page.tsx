import type { Metadata } from 'next';
import { PaymentsPage } from '@/components/investor/pages/PaymentsPage';

export const metadata: Metadata = { title: 'Make a payment' };

export default function InvestorPaymentsPage() {
  return <PaymentsPage />;
}
