import type { Metadata } from 'next';
import { ReceiptPage } from '@/components/investor/pages/ReceiptPage';

export const metadata: Metadata = { title: 'Receipt' };

export default async function InvestorReceiptPage({ params }: { params: Promise<{ no: string }> }) {
  const { no } = await params;
  return <ReceiptPage receiptNo={decodeURIComponent(no)} />;
}
