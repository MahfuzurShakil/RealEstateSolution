import type { Metadata } from 'next';
import { InvestPage } from '@/components/public/pages/InvestPage';

export const metadata: Metadata = {
  title: 'Invest',
  description: 'Own a share of a project: open share offerings, payment plans and how to buy.',
};

export default function Page() {
  return <InvestPage />;
}
