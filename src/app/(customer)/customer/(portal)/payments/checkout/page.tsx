import type { Metadata } from 'next';
import { CheckoutPage } from '@/components/investor/pages/CheckoutPage';

export const metadata: Metadata = { title: 'Make a payment' };

export default async function InvestorCheckoutPage({ searchParams }: { searchParams: Promise<{ holding?: string }> }) {
  const { holding } = await searchParams;
  return <CheckoutPage holdingFilter={holding ?? null} />;
}
