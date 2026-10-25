import type { Metadata } from 'next';
import { Hind_Siliguri, League_Spartan } from 'next/font/google';
import { SiteFooter } from '@/components/public/SiteFooter';
import { SiteHeader } from '@/components/public/SiteHeader';
import { WhatsAppButton } from '@/components/public/WhatsAppButton';

const spartan = League_Spartan({ variable: '--font-spartan', subsets: ['latin'] });
// only for the ৳ sign, which League Spartan does not draw
const hind = Hind_Siliguri({ variable: '--font-hind', subsets: ['bengali'], weight: ['600'] });

export const metadata: Metadata = {
  title: 'Apartments, plots and land shares in Dhaka',
  description: 'Projects on sale, live availability, construction progress and enquiries.',
};

/**
 * Public Portal shell (Public Portal v2.0 §1). Layout ideas from the Hously
 * template the client picked, written here from scratch: white header, green
 * accents, slate footer. English only for now. Every page underneath
 * reads data only through `src/lib/repositories/public/*`.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${spartan.variable} ${hind.variable} flex min-h-screen flex-col bg-white font-site text-site-ink`}
    >
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
      <WhatsAppButton />
    </div>
  );
}
