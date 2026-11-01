import type { Metadata } from 'next';
import { ProfilePage } from '@/components/investor/pages/ProfilePage';

export const metadata: Metadata = { title: 'My profile' };

export default function InvestorProfilePage() {
  return <ProfilePage />;
}
