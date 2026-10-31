import type { Metadata } from 'next';
import { NotificationsPage } from '@/components/investor/pages/NotificationsPage';

export const metadata: Metadata = { title: 'Notifications' };

export default function InvestorNotificationsPage() {
  return <NotificationsPage />;
}
