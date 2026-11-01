import type { Metadata } from 'next';
import { PaymentResultPage } from '@/components/investor/pages/PaymentResultPage';

export const metadata: Metadata = { title: 'Payment result' };

export default async function InvestorPaymentResultPage({ params }: { params: Promise<{ intent: string }> }) {
  const { intent } = await params;
  return <PaymentResultPage intentId={intent} />;
}
