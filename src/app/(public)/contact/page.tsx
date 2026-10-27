import type { Metadata } from 'next';
import { ContactPage } from '@/components/public/pages/ContactPage';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Call, WhatsApp, visit the office or send a message — we reply the same day.',
};

export default function Page() {
  return <ContactPage />;
}
