import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Real Estate Developer Platform',
};

/**
 * Public Portal shell. Deliberately bare for now — its own visual identity
 * (Design Reference Part B: fresh palette, stock imagery, distinct from the
 * Admin teal) is designed when Modules P1–P4 are built.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-white">{children}</div>;
}
