import type { Metadata } from 'next';
import { DocumentsPage } from '@/components/investor/pages/DocumentsPage';

export const metadata: Metadata = { title: 'Documents' };

export default function InvestorDocumentsPage() {
  return <DocumentsPage />;
}
