import { cn } from '@/lib/utils/cn';

/*
 * Payment-method marks for the checkout and the sandbox gateway. These are the
 * networks' and wallets' own colours (not the website brand), drawn as simple
 * inline SVG so nothing is loaded from outside; swap in the official artwork
 * from each provider's merchant kit for the live build.
 */

export type LogoName = 'visa' | 'mastercard' | 'amex' | 'bkash' | 'nagad' | 'rocket';

function Visa() {
  return (
    <svg viewBox="0 0 48 30" aria-hidden className="size-full">
      <rect width="48" height="30" rx="4" fill="#fff" />
      <text x="24" y="20.5" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontSize="14" fontWeight="900" fontStyle="italic" fill="#1A1F71" letterSpacing="-0.5">
        VISA
      </text>
    </svg>
  );
}

function Mastercard() {
  return (
    <svg viewBox="0 0 48 30" aria-hidden className="size-full">
      <rect width="48" height="30" rx="4" fill="#fff" />
      <circle cx="19" cy="15" r="9" fill="#EB001B" />
      <circle cx="29" cy="15" r="9" fill="#F79E1B" />
      <path d="M24 7.5a9 9 0 0 1 0 15a9 9 0 0 1 0-15Z" fill="#FF5F00" />
    </svg>
  );
}

function Amex() {
  return (
    <svg viewBox="0 0 48 30" aria-hidden className="size-full">
      <rect width="48" height="30" rx="4" fill="#2E77BC" />
      <text x="24" y="19" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontSize="9.5" fontWeight="800" fill="#fff" letterSpacing="0.6">
        AMEX
      </text>
    </svg>
  );
}

function Wallet({ bg, label, accent }: { bg: string; label: string; accent?: string }) {
  return (
    <svg viewBox="0 0 48 30" aria-hidden className="size-full">
      <rect width="48" height="30" rx="4" fill={bg} />
      {accent && <path d="M6 22 L13 8 L17 17 Z" fill={accent} opacity="0.9" />}
      <text x={accent ? 29 : 24} y="19" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontSize="10" fontWeight="800" fill="#fff">
        {label}
      </text>
    </svg>
  );
}

const MARK: Record<LogoName, () => React.ReactElement> = {
  visa: Visa,
  mastercard: Mastercard,
  amex: Amex,
  bkash: () => <Wallet bg="#E2136E" label="bKash" accent="#fff" />,
  nagad: () => <Wallet bg="#F7941D" label="Nagad" />,
  rocket: () => <Wallet bg="#8C3494" label="Rocket" />,
};

export const LOGO_LABEL: Record<LogoName, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  bkash: 'bKash',
  nagad: 'Nagad',
  rocket: 'Rocket',
};

/** One mark, 48×30 by default; `className` sets the size. */
export function PaymentLogo({ name, className }: { name: LogoName; className?: string }) {
  const Mark = MARK[name];
  return (
    <span role="img" aria-label={LOGO_LABEL[name]} className={cn('inline-block h-7.5 w-12 shrink-0 overflow-hidden rounded-[5px] ring-1 ring-black/10', className)}>
      <Mark />
    </span>
  );
}

export function AcceptedLogos({ className, names = ['visa', 'mastercard', 'amex', 'bkash', 'nagad', 'rocket'] }: { className?: string; names?: LogoName[] }) {
  return (
    <span className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {names.map((n) => (
        <PaymentLogo key={n} name={n} className="h-6 w-[38px]" />
      ))}
    </span>
  );
}
