import type { Metadata } from 'next';
import { Hind_Siliguri, Instrument_Serif, League_Spartan, Plus_Jakarta_Sans } from 'next/font/google';
import { SiteFooter } from '@/components/public/SiteFooter';
import { SiteHeader } from '@/components/public/SiteHeader';
import { WhatsAppButton } from '@/components/public/WhatsAppButton';

// The brand's type (master plan §5.2) is declared here once, so a rebrand changes one file.
const spartan = League_Spartan({ variable: '--font-spartan', subsets: ['latin'] });
const jakarta = Plus_Jakarta_Sans({ variable: '--font-jakarta', subsets: ['latin'] });
const instrument = Instrument_Serif({ variable: '--font-instrument', subsets: ['latin'], weight: ['400'], style: ['italic'] });
// only for the ৳ sign, which the Latin faces do not draw
const hind = Hind_Siliguri({ variable: '--font-hind', subsets: ['bengali'], weight: ['600'] });

export const metadata: Metadata = {
  title: 'Apartments, plots and land shares',
  description: 'Projects on sale, live availability, construction progress and enquiries.',
};

/**
 * Public Portal shell (Public Portal v2.0 §1, PUBLIC-WEBSITE-MASTER-PLAN.md).
 * No company name or brand colour is written here: the name comes from
 * Settings → Company and colours from the `site-` tokens (§0.1). Every page
 * underneath reads data only through `src/lib/repositories/public/*`.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      id="site-root"
      lang="en"
      className={`${spartan.variable} ${jakarta.variable} ${instrument.variable} ${hind.variable} site flex min-h-screen flex-col bg-site-ivory font-site text-site-ink antialiased`}
    >
      <SiteHeader />
      <main id="main" className="flex-1">{children}</main>
      <SiteFooter />
      <WhatsAppButton />
    </div>
  );
}
