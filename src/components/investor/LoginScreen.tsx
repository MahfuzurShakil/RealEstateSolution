'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, BadgeCheck, FileCheck2, KeyRound, Loader2, LockKeyhole, PieChart, WalletCards } from 'lucide-react';
import { BrandMark } from '@/components/public/BrandMark';
import { HERO_IMAGE } from '@/components/public/stock-images';
import { Button } from '@/components/public/ui/Button';
import { useCompanyInfo } from '@/components/public/useCompanyInfo';
import { investorRepository } from '@/lib/repositories/investor/investor.mock.repository';
import { formatPhone } from '@/lib/utils/format';

const FEATURES = [
  { icon: PieChart, title: 'Your shares at a glance', body: 'Ownership, value and payment progress for every project you invest in.' },
  { icon: WalletCards, title: 'Pay installments online', body: 'bKash, Nagad or card through a secure payment gateway, with instant receipts.' },
  { icon: FileCheck2, title: 'Documents any time', body: 'Agreement, deed, payment schedule and share certificate in one place.' },
];

function CodeBoxes({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? '');

  const set = (i: number, d: string) => {
    const next = digits.slice();
    next[i] = d;
    onChange(next.join('').slice(0, 6));
  };
  const onKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus();
    if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus();
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted);
    refs.current[Math.min(pasted.length, 5)]?.focus();
  };

  return (
    <div className="flex justify-between gap-2" role="group" aria-label="6-digit code">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          aria-label={`Digit ${i + 1}`}
          onPaste={onPaste}
          onKeyDown={(e) => onKey(i, e)}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(-1);
            set(i, v);
            if (v && i < 5) refs.current[i + 1]?.focus();
          }}
          className="tabular font-display size-12 rounded-2xl border border-site-line bg-white text-center text-xl font-semibold transition-colors outline-none focus:border-site-primary focus:ring-4 focus:ring-site-primary/15 sm:size-14"
        />
      ))}
    </div>
  );
}

export function LoginScreen({ next, signedOut }: { next: string | null; signedOut: boolean }) {
  const router = useRouter();
  const company = useCompanyInfo();
  const demo = investorRepository.demoLogin;
  const [step, setStep] = useState<'id' | 'code'>('id');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const target = next && next.startsWith('/investor') ? next : '/investor';

  // already signed in: straight to the portal
  useEffect(() => {
    if (investorRepository.session()) router.replace(target);
  }, [router, target]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const requestCode = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!identifier.trim()) return setError('Please enter your mobile number or email address.');
    setBusy(true);
    setError(null);
    const res = await investorRepository.requestCode(identifier);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setSentTo(res.sent_to);
    setCode('');
    setStep('code');
    setResendIn(30);
  };

  const verify = async (e?: FormEvent) => {
    e?.preventDefault();
    if (code.length !== 6) return setError('Please enter the 6-digit code.');
    setBusy(true);
    setError(null);
    const res = await investorRepository.verifyCode(code);
    if (!res.ok) {
      setBusy(false);
      return setError(res.error);
    }
    router.replace(target);
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* brand panel */}
      <div className="relative hidden overflow-hidden bg-site-night text-white lg:flex lg:flex-col">
        <div aria-hidden className="absolute inset-0 bg-cover bg-center opacity-35" style={{ backgroundImage: `url(${HERO_IMAGE})` }} />
        <div aria-hidden className="absolute inset-0 bg-linear-to-br from-site-night/95 via-site-night/85 to-site-night-deep/95" />
        <div className="relative flex flex-1 flex-col justify-between p-12 xl:p-16">
          <Link href="/" className="w-fit rounded-xl">
            <BrandMark company={company} tone="dark" />
          </Link>
          <div className="max-w-lg">
            <p className="text-xs font-semibold tracking-[0.2em] text-site-brass uppercase">Customer Portal · Investor</p>
            <h2 className="mt-4 text-4xl leading-[1.1] font-semibold xl:text-5xl">
              Your project shares, <span className="font-accent font-normal text-site-brass italic">in one secure place.</span>
            </h2>
            <ul className="mt-10 space-y-6">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex gap-4">
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/10 text-site-brass">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span>
                    <span className="block font-semibold">{title}</span>
                    <span className="mt-0.5 block text-[15px] text-white/65">{body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <p className="flex items-center gap-2 text-sm text-white/55">
            <LockKeyhole className="size-4" aria-hidden /> Sign-in is protected by a one-time passcode.
          </p>
        </div>
      </div>

      {/* form */}
      <div className="flex flex-col px-5 py-8 sm:px-10">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="lg:hidden">
            <BrandMark company={company} />
          </Link>
          <Link href="/" className="ml-auto inline-flex items-center gap-1.5 text-sm font-medium text-site-muted transition-colors hover:text-site-primary">
            <ArrowLeft className="size-4" aria-hidden /> Back to website
          </Link>
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <span className="grid size-14 place-items-center rounded-2xl bg-site-primary-soft text-site-primary">
            {step === 'id' ? <KeyRound className="size-6" aria-hidden /> : <BadgeCheck className="size-6" aria-hidden />}
          </span>
          <h1 className="mt-6 text-3xl font-semibold">{step === 'id' ? 'Sign in to your account' : 'Enter your code'}</h1>
          <p className="mt-2 text-[15px] text-site-muted">
            {step === 'id'
              ? 'For customers of type Investor. Use the mobile number or email address registered on your share agreement.'
              : `We sent a 6-digit code by ${sentTo}. It expires in 10 minutes.`}
          </p>

          {signedOut && step === 'id' && !error && (
            <p className="mt-6 rounded-2xl bg-site-primary-soft px-4 py-3 text-sm font-medium text-site-primary-dark" role="status">
              You have signed out. See you soon.
            </p>
          )}
          {error && (
            <p className="mt-6 flex gap-2.5 rounded-2xl bg-red-50 px-4 py-3 text-sm text-site-danger" role="alert">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {error}
            </p>
          )}

          {step === 'id' ? (
            <form onSubmit={requestCode} className="mt-6 space-y-5" noValidate>
              <label className="block">
                <span className="text-sm font-semibold">Mobile number or email</span>
                <input
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  placeholder="01XXX XXXXXX or name@example.com"
                  className="mt-2 h-13 w-full rounded-2xl border border-site-line bg-white px-4 text-[15px] transition-colors outline-none placeholder:text-site-faint focus:border-site-primary focus:ring-4 focus:ring-site-primary/15"
                />
              </label>
              <Button type="submit" size="lg" className="w-full" disabled={busy} iconRight={busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}>
                {busy ? 'Sending code' : 'Send me a code'}
              </Button>
            </form>
          ) : (
            <form onSubmit={verify} className="mt-6 space-y-5">
              <CodeBoxes value={code} onChange={setCode} disabled={busy} />
              <Button type="submit" size="lg" className="w-full" disabled={busy || code.length !== 6} iconRight={busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}>
                {busy ? 'Signing in' : 'Verify and sign in'}
              </Button>
              <div className="flex items-center justify-between text-sm">
                <button type="button" className="font-medium text-site-muted hover:text-site-primary" onClick={() => { setStep('id'); setError(null); }}>
                  Use a different number
                </button>
                <button type="button" disabled={resendIn > 0 || busy} onClick={() => requestCode()} className="tabular font-semibold text-site-primary disabled:text-site-faint">
                  {resendIn > 0 ? `Resend in 0:${String(resendIn).padStart(2, '0')}` : 'Resend code'}
                </button>
              </div>
            </form>
          )}

          <div className="mt-8 rounded-2xl border border-dashed border-site-brass/50 bg-site-brass/5 p-4 text-sm">
            <p className="font-semibold text-site-brass-dark">Demo account</p>
            <p className="mt-1 text-site-muted">
              Mobile <span className="tabular font-semibold text-site-ink">{formatPhone(demo.phone)}</span> · code{' '}
              <span className="tabular font-semibold text-site-ink">{demo.otp}</span>
            </p>
            <button
              type="button"
              className="mt-2 font-semibold text-site-primary hover:underline"
              onClick={() => {
                setError(null);
                if (step === 'id') setIdentifier(formatPhone(demo.phone));
                else setCode(demo.otp);
              }}
            >
              {step === 'id' ? 'Fill in the demo number' : 'Fill in the demo code'}
            </button>
          </div>

          <p className="mt-8 text-center text-sm text-site-muted">
            Not a customer yet?{' '}
            <Link href="/projects" className="font-semibold text-site-primary hover:underline">
              Explore our projects
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
