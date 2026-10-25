import type { Metadata } from 'next';
import { Fraunces } from 'next/font/google';
import { SiteFooter } from '@/components/public/SiteFooter';
import { SiteHeader } from '@/components/public/SiteHeader';
import { WhatsAppButton } from '@/components/public/WhatsAppButton';

const fraunces = Fraunces({ variable: '--font-fraunces', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Homes, plots and land shares',
  description: 'Projects on sale, construction progress and enquiries.',
};

/**
 * Public Portal shell (Public Portal v2.0 §1). Its own identity — forest,
 * brass and sand with a serif display face (Design Reference Part B) — so it
 * never reads as the admin teal. Every page underneath reads data only through
 * `src/lib/repositories/public/*`.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${fraunces.variable} flex min-h-screen flex-col bg-site-sand text-site-ink`}>
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
      <WhatsAppButton />
    </div>
  );
}
