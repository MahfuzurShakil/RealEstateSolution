import type { Metadata } from 'next';
import { SITE_FONT_VARS } from '@/components/public/site-fonts';

export const metadata: Metadata = {
  title: { default: 'Customer Portal', template: '%s · Customer Portal' },
  description: 'Your project shares, payment schedule, online payments and receipts.',
  // private, signed-in pages: never in search results
  robots: { index: false, follow: false },
};

/**
 * Customer Portal for customers of type Investor (PROJECT-SHARE-SALE-PLAN.md).
 * Part of the public website — same brand type and `site-` colours — but with
 * its own app-style shell instead of the marketing header and footer.
 */
export default function InvestorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div id="site-root" lang="en" className={`${SITE_FONT_VARS} site min-h-screen bg-site-ivory font-site text-site-ink antialiased`}>
      {children}
    </div>
  );
}
