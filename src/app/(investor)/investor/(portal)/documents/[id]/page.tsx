import type { Metadata } from 'next';
import { DocumentViewPage } from '@/components/investor/pages/DocumentViewPage';

export const metadata: Metadata = { title: 'Document' };

export default async function InvestorDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DocumentViewPage id={decodeURIComponent(id)} />;
}
