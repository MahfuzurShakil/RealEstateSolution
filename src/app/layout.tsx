import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { DatabaseProvider } from '@/lib/db/DatabaseProvider';
import './globals.css';

const inter = Inter({ variable: '--font-sans', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Real Estate Developer Platform',
  description: 'Admin Portal and Public Portal for a real estate developer.',
};

/**
 * Root layout is intentionally thin — the two portals bring their own chrome:
 * src/app/admin/layout.tsx and src/app/(public)/layout.tsx.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="min-h-full">
        <DatabaseProvider>{children}</DatabaseProvider>
      </body>
    </html>
  );
}
