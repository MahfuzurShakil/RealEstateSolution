import type { Metadata } from 'next';
import { PaymentsPage } from '@/components/investor/pages/PaymentsPage';

export const metadata: Metadata = { title: 'Make a payment' };

export default async function InvestorPaymentsPage({ searchParams }: { searchParams: Promise<{ holding?: string }> }) {
  const { holding } = await searchParams;
  return <PaymentsPage holdingFilter={holding ?? null} />;
}
