import type { Metadata } from 'next';
import { GatewayScreen } from '@/components/investor/GatewayScreen';

export const metadata: Metadata = { title: 'Secure payment' };

/** The (mock) payment gateway's checkout — outside the portal shell, as a real hosted page would be. */
export default async function InvestorGatewayPage({ params }: { params: Promise<{ intent: string }> }) {
  const { intent } = await params;
  return <GatewayScreen intentId={intent} />;
}
