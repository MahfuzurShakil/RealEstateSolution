import type { Metadata } from 'next';
import { NrbPage } from '@/components/public/pages/NrbPage';

export const metadata: Metadata = {
  title: 'Buying from abroad',
  description: 'Choose, book and pay for a home in Bangladesh from wherever you live.',
};

export default function Page() {
  return <NrbPage />;
}
