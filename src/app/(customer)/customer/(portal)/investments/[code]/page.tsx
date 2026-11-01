import type { Metadata } from 'next';
import { HoldingDetailPage } from '@/components/investor/pages/HoldingDetailPage';

export const metadata: Metadata = { title: 'Investment details' };

export default async function InvestorHoldingPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <HoldingDetailPage code={decodeURIComponent(code)} />;
}
