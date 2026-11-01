import type { Metadata } from 'next';
import { LoginScreen } from '@/components/investor/LoginScreen';

export const metadata: Metadata = { title: 'Sign in' };

export default async function InvestorLoginPage({ searchParams }: { searchParams: Promise<{ next?: string; signed_out?: string }> }) {
  const { next, signed_out } = await searchParams;
  return <LoginScreen next={next ?? null} signedOut={signed_out === '1'} />;
}
