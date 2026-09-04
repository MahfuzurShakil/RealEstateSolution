'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { CompanySettings } from '@/lib/db/types';

/**
 * The paper the three documents are printed on (Tier 3.6).
 *
 * Letterhead, toolbar and footer in one place, so the receipt, booking form
 * and supplier voucher cannot drift apart — an office filing all three wants
 * the same company block at the top of each.
 */
export function PrintSheet({
  company,
  title,
  subtitle,
  children,
  footnote,
}: {
  company: CompanySettings | undefined;
  title: string;
  subtitle?: string | null;
  children: ReactNode;
  footnote?: string;
}) {
  const router = useRouter();

  return (
    <>
      <div className="print-hide mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-2 px-4">
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print
        </Button>
      </div>

      <div className="print-sheet shadow-sm print:shadow-none">
        {/* Stacks on a phone and sits side by side from 640 px up. On paper the
            sheet is always A4-wide, so `print:flex-row` keeps the letterhead in
            its proper two-column shape regardless of the screen it was
            triggered from — without this the title fell off the right edge at
            375 px. */}
        <header className="flex flex-col items-start justify-between gap-3 border-b-2 border-ink pb-4 sm:flex-row sm:gap-6 print:flex-row print:gap-6">
          <div className="flex items-start gap-3">
            {company?.logo_url ? (
              // Deliberately a plain <img>, not next/image: the logo is an
              // arbitrary URL the user pasted into Settings, and next/image
              // refuses any host that is not in `remotePatterns` — which would
              // make the letterhead fail for every logo but the ones we
              // predicted. Fixed box so a 404 cannot reshape the header.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={company.logo_url}
                alt=""
                className="h-14 w-14 object-contain"
              />
            ) : null}
            <div>
              <h1 className="text-xl font-semibold text-ink">
                {company?.company_name ?? 'Company name not set'}
              </h1>
              {company?.address ? (
                <p className="mt-0.5 max-w-md text-xs text-ink-muted">{company.address}</p>
              ) : null}
              {/* An unfilled Settings field leaves no empty line behind — a
                  letterhead with a gap where the licence number should be
                  looks like a printing fault, not like missing data. */}
              <ContactLine
                parts={[
                  company?.phone ? `Phone ${company.phone}` : null,
                  company?.email,
                  company?.website,
                ]}
              />
              <ContactLine
                parts={[
                  company?.trade_license_no ? `Trade licence ${company.trade_license_no}` : null,
                  company?.tax_id ? `TIN/BIN ${company.tax_id}` : null,
                ]}
              />
            </div>
          </div>
          <div className="shrink-0 text-left sm:text-right print:text-right">
            <p className="text-lg font-semibold uppercase tracking-wide text-ink">{title}</p>
            {subtitle ? <p className="text-xs text-ink-muted">{subtitle}</p> : null}
          </div>
        </header>

        <main className="pt-5 text-sm text-ink">{children}</main>

        {footnote ? (
          <footer className="mt-8 border-t border-hairline pt-2 text-[11px] text-ink-muted">
            {footnote}
          </footer>
        ) : null}
      </div>
    </>
  );
}

function ContactLine({ parts }: { parts: (string | null | undefined)[] }) {
  const text = parts.filter(Boolean).join(' · ');
  return text ? <p className="mt-0.5 text-xs text-ink-muted">{text}</p> : null;
}

/** A label above its value — the layout every block on these documents uses. */
export function PrintField({
  label,
  value,
  className = '',
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-[11px] uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="text-sm text-ink">{value ?? '—'}</p>
    </div>
  );
}

/** The two ruled lines every one of these documents ends with. */
export function SignatureRow({ left, right }: { left: string; right: string }) {
  return (
    <div className="print-nobreak mt-12 flex items-end justify-between gap-10">
      {[left, right].map((label) => (
        <div key={label} className="w-56 border-t border-ink pt-1 text-center text-xs text-ink-muted">
          {label}
        </div>
      ))}
    </div>
  );
}
