'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from 'react';
import { AlertCircle, ArrowRight, CircleCheck, FileCheck2, Loader2, LockKeyhole, Mail, PencilLine, PieChart, Smartphone, WalletCards, X } from 'lucide-react';
import { BrandMark } from '@/components/public/BrandMark';
import { HERO_IMAGE } from '@/components/public/stock-images';
import { Button } from '@/components/public/ui/Button';
import { useCompanyInfo } from '@/components/public/useCompanyInfo';
import { investorRepository } from '@/lib/repositories/investor/investor.mock.repository';
import { cn } from '@/lib/utils/cn';
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
    <div className="grid grid-cols-6 gap-2 sm:gap-2.5" role="group" aria-label="6-digit code">
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
          style={{ outline: 'none' }}
          className="tabular font-display aspect-square w-full min-w-0 rounded-xl border border-site-line bg-white text-center text-xl font-semibold transition-colors focus:border-site-primary focus:ring-4 focus:ring-site-primary/15 sm:rounded-2xl sm:text-2xl"
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
  const [notice, setNotice] = useState(signedOut);
  const isEmail = identifier.includes('@');
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
    <div className="grid min-h-screen grid-cols-[minmax(0,1fr)] lg:grid-cols-[1.05fr_1fr]">
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
      <div className="flex min-h-screen flex-col bg-white lg:min-h-0">
        {/* phones: a short brand band stands in for the side panel */}
        <div className="relative overflow-hidden bg-site-night px-6 pt-8 pb-14 text-white lg:hidden">
          <div aria-hidden className="absolute inset-0 bg-cover bg-center opacity-25" style={{ backgroundImage: `url(${HERO_IMAGE})` }} />
          <div aria-hidden className="absolute inset-0 bg-linear-to-b from-site-night/80 to-site-night" />
          <div className="relative">
            <Link href="/" className="inline-block rounded-xl">
              <BrandMark company={company} tone="dark" />
            </Link>
            <p className="mt-7 text-[11px] font-semibold tracking-[0.2em] text-site-brass uppercase">Customer Portal</p>
            <p className="font-display mt-1.5 text-2xl leading-tight font-semibold">
              Your project shares, <span className="font-accent font-normal text-site-brass italic">in one secure place.</span>
            </p>
          </div>
        </div>

        <div className="relative -mt-6 flex flex-1 flex-col rounded-t-[28px] bg-white px-6 pt-8 pb-6 sm:px-10 lg:mt-0 lg:rounded-none lg:px-16 lg:py-12">
          <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col lg:justify-center">
            <div className="flex items-center gap-3" aria-label={`Step ${step === 'id' ? 1 : 2} of 2`}>
              <span className="flex gap-1.5" aria-hidden>
                <span className="h-1.5 w-8 rounded-full bg-site-primary" />
                <span className={cn('h-1.5 w-8 rounded-full transition-colors', step === 'code' ? 'bg-site-primary' : 'bg-site-line')} />
              </span>
              <span className="tabular text-xs font-semibold text-site-muted">Step {step === 'id' ? 1 : 2} of 2</span>
            </div>

            <h1 className="mt-5 text-[28px] leading-tight font-semibold sm:text-[32px]">{step === 'id' ? 'Welcome back' : 'Check your phone'}</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-site-muted">
              {step === 'id' ? 'Sign in with the mobile number or email on your share agreement.' : 'Enter the 6-digit code we just sent you. It expires in 10 minutes.'}
            </p>

            {notice && step === 'id' && !error && (
              <div className="mt-6 flex items-center gap-3 rounded-xl border border-site-primary/20 bg-site-primary-soft/60 px-3.5 py-3 text-sm" role="status">
                <CircleCheck className="size-5 shrink-0 text-site-primary" aria-hidden />
                <span className="flex-1 font-medium text-site-primary-dark">You have signed out securely.</span>
                <button type="button" aria-label="Dismiss" onClick={() => setNotice(false)} className="grid size-6 place-items-center rounded-md text-site-primary-dark/60 hover:text-site-primary-dark">
                  <X className="size-4" />
                </button>
              </div>
            )}
            {error && (
              <div className="mt-6 flex gap-3 rounded-xl border border-site-danger/20 bg-red-50 px-3.5 py-3 text-sm text-site-danger" role="alert">
                <AlertCircle className="mt-px size-5 shrink-0" aria-hidden />
                <span>{error}</span>
              </div>
            )}

            {step === 'id' ? (
              <form onSubmit={requestCode} className="mt-7 space-y-5" noValidate>
                <label className="block">
                  <span className="text-sm font-semibold">Mobile number or email</span>
                  <span className="mt-2 flex h-13 items-center gap-3 rounded-xl border border-site-line bg-white px-4 transition-colors focus-within:border-site-primary focus-within:ring-4 focus-within:ring-site-primary/15">
                    {isEmail ? <Mail className="size-5 shrink-0 text-site-faint" aria-hidden /> : <Smartphone className="size-5 shrink-0 text-site-faint" aria-hidden />}
                    <input
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      autoComplete="username"
                      autoFocus
                      inputMode={isEmail ? 'email' : 'text'}
                      placeholder="01XXX XXXXXX or name@email.com"
                      style={{ outline: 'none' }}
                      className="h-full w-full min-w-0 bg-transparent text-[15px] placeholder:text-site-faint"
                    />
                  </span>
                </label>
                <Button type="submit" size="lg" className="w-full rounded-xl" disabled={busy} iconRight={busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}>
                  {busy ? 'Sending code' : 'Continue'}
                </Button>
              </form>
            ) : (
              <form onSubmit={verify} className="mt-7 space-y-5">
                <div className="flex items-center justify-between gap-3 rounded-xl bg-site-ivory px-3.5 py-3 text-sm">
                  <span className="min-w-0 truncate text-site-muted">
                    Sent by <span className="font-semibold text-site-ink">{sentTo}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setStep('id');
                      setError(null);
                    }}
                    className="inline-flex shrink-0 items-center gap-1 font-semibold text-site-primary hover:underline"
                  >
                    <PencilLine className="size-3.5" aria-hidden /> Change
                  </button>
                </div>
                <CodeBoxes value={code} onChange={setCode} disabled={busy} />
                <Button type="submit" size="lg" className="w-full rounded-xl" disabled={busy || code.length !== 6} iconRight={busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}>
                  {busy ? 'Signing in' : 'Verify and sign in'}
                </Button>
                <p className="text-center text-sm text-site-muted">
                  Didn’t get it?{' '}
                  <button type="button" disabled={resendIn > 0 || busy} onClick={() => requestCode()} className="tabular font-semibold text-site-primary disabled:font-medium disabled:text-site-faint">
                    {resendIn > 0 ? `Resend in 0:${String(resendIn).padStart(2, '0')}` : 'Resend code'}
                  </button>
                </p>
              </form>
            )}

            <div className="mt-7 flex items-center justify-between gap-3 rounded-xl border border-dashed border-site-brass/50 bg-site-brass/5 px-3.5 py-2.5 text-[13px]">
              <span className="min-w-0 text-site-muted">
                <span className="font-semibold text-site-brass-dark">Demo</span> ·{' '}
                {step === 'id' ? (
                  <span className="tabular">{formatPhone(demo.phone)}</span>
                ) : (
                  <>
                    code <span className="tabular">{demo.otp}</span>
                  </>
                )}
              </span>
              <button
                type="button"
                className="shrink-0 font-semibold text-site-primary hover:underline"
                onClick={() => {
                  setError(null);
                  if (step === 'id') setIdentifier(formatPhone(demo.phone));
                  else setCode(demo.otp);
                }}
              >
                Fill in
              </button>
            </div>
          </div>

          <footer className="mx-auto mt-10 w-full max-w-[400px] space-y-2 text-center text-[13px] text-site-muted">
            <p className="flex items-center justify-center gap-1.5">
              <LockKeyhole className="size-3.5" aria-hidden /> Protected by a one-time passcode
            </p>
            <p>
              Not a customer yet?{' '}
              <Link href="/projects" className="font-semibold text-site-primary hover:underline">
                Explore our projects
              </Link>
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}
