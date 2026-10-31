import type { Metadata } from 'next';
import { EnquiryProvider } from '@/components/public/enquiry/EnquiryProvider';
import { SiteFooter } from '@/components/public/SiteFooter';
import { SiteHeader } from '@/components/public/SiteHeader';
import { SITE_FONT_VARS } from '@/components/public/site-fonts';
import { WhatsAppButton } from '@/components/public/WhatsAppButton';

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
      className={`${SITE_FONT_VARS} site flex min-h-screen flex-col bg-site-ivory font-site text-site-ink antialiased`}
    >
      <EnquiryProvider>
        <SiteHeader />
        <main id="main" className="flex-1">{children}</main>
        <SiteFooter />
        <WhatsAppButton />
      </EnquiryProvider>
    </div>
  );
}
