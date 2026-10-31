import { useId } from 'react';
import { cn } from '@/lib/utils/cn';
import type { PublicCompanyInfo } from '@/lib/repositories/public/content.public.repository';

/**
 * The stand-in logo when Settings → Company has none: three towers on the
 * brand green, a brass roofline and ground line, a few lit windows. Drawn
 * from the `site-` colour tokens only (§0.1), so a rebrand re-colours it and
 * it never spells a company's name — a real logo replaces it outright.
 */
export function BrandEmblem({ className }: { className?: string }) {
  // one gradient id per emblem: a shared id breaks every copy when the first sits in a hidden sidebar
  const bg = `brand-emblem-${useId().replace(/:/g, '')}`;
  return (
    <svg viewBox="0 0 40 40" aria-hidden className={cn('size-10 shrink-0 drop-shadow-sm', className)}>
      <defs>
        <linearGradient id={bg} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--color-site-primary-bright)" />
          <stop offset="1" stopColor="var(--color-site-primary-dark)" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill={`url(#${bg})`} />
      {/* towers */}
      <rect x="8.5" y="17" width="7" height="14.5" rx="1" fill="white" fillOpacity="0.78" />
      <rect x="16.5" y="10.5" width="7.5" height="21" rx="1" fill="white" />
      <rect x="25" y="14.5" width="6.5" height="17" rx="1" fill="white" fillOpacity="0.88" />
      {/* roofline of the tall tower */}
      <path d="M15.75 10.75 L20.25 6.5 L24.75 10.75 Z" fill="var(--color-site-brass)" />
      {/* windows */}
      <g fill="var(--color-site-primary-dark)">
        <rect x="18.4" y="13.5" width="1.5" height="1.5" rx="0.3" />
        <rect x="20.9" y="13.5" width="1.5" height="1.5" rx="0.3" />
        <rect x="18.4" y="17" width="1.5" height="1.5" rx="0.3" />
        <rect x="20.9" y="17" width="1.5" height="1.5" rx="0.3" />
        <rect x="18.4" y="20.5" width="1.5" height="1.5" rx="0.3" />
        <rect x="20.9" y="20.5" width="1.5" height="1.5" rx="0.3" fill="var(--color-site-brass)" />
        <rect x="10.5" y="20" width="1.4" height="1.4" rx="0.3" />
        <rect x="12.6" y="23.5" width="1.4" height="1.4" rx="0.3" />
        <rect x="27" y="18" width="1.4" height="1.4" rx="0.3" />
        <rect x="29" y="21.5" width="1.4" height="1.4" rx="0.3" />
      </g>
      {/* door and ground line */}
      <rect x="19.2" y="26.5" width="2.3" height="5" rx="1.15" fill="var(--color-site-primary-dark)" />
      <rect x="7" y="31.5" width="26" height="1.8" rx="0.9" fill="var(--color-site-brass)" />
    </svg>
  );
}

/**
 * The chosen mark (logo 3, 2026-11-01): two towers joined by a brass beam,
 * which together read as the letter N, standing on a brass ground line. The
 * shape is drawn for an N — a company whose name starts with another letter
 * gets the skyline emblem instead (see `CompanyEmblem`).
 */
export function TowerLetterEmblem({ tone = 'light', className }: { tone?: 'light' | 'dark'; className?: string }) {
  const tower = tone === 'dark' ? 'var(--color-site-primary-bright)' : 'var(--color-site-primary)';
  return (
    <svg viewBox="0 0 44 44" aria-hidden className={cn('size-10 shrink-0', className)}>
      <rect x="6" y="14" width="9" height="27" rx="1.5" fill={tower} />
      <rect x="29" y="6" width="9" height="35" rx="1.5" fill={tower} />
      <path d="M15 15 29 34" stroke="var(--color-site-brass)" strokeWidth="5" strokeLinecap="square" />
      <rect x="3" y="40" width="38" height="2.4" rx="1.2" fill="var(--color-site-brass)" />
    </svg>
  );
}

export type EmblemStyle = 'skyline' | 'tower';

/** The right emblem for a company name: the tower letter for an N, otherwise the skyline. */
export function CompanyEmblem({ name, tone = 'light', className }: { name: string; tone?: 'light' | 'dark'; className?: string }) {
  return name.trim().charAt(0).toUpperCase() === 'N' ? <TowerLetterEmblem tone={tone} className={className} /> : <BrandEmblem className={className} />;
}

/**
 * The developer's logo + name (§0.1). Uses the logo from Settings → Company when
 * one is set; otherwise the tower letter (or the skyline for a name not
 * starting with N) beside a two-line wordmark, so a new client looks branded
 * on day one without any code change.
 */
export function BrandMark({
  company,
  tone = 'light',
  emblem = 'tower',
  className,
}: {
  company: PublicCompanyInfo | undefined;
  tone?: 'light' | 'dark';
  emblem?: EmblemStyle;
  className?: string;
}) {
  if (!company) return <span className={cn('block h-10 w-44 rounded-lg bg-site-soft', tone === 'dark' && 'bg-white/10', className)} />;
  const name = company.company_name;
  const [first, ...others] = name.trim().split(/\s+/);
  const rest = others.join(' ');
  // the tower letter is drawn for an N; any other name keeps the skyline
  const tower = emblem === 'tower' && first.charAt(0).toUpperCase() === 'N';
  return (
    <span className={cn('flex min-w-0 items-center gap-2.5', className)}>
      {company.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- logo is any URL typed in Settings
        <img src={company.logo_url} alt="" className="h-10 w-auto max-w-[120px] shrink-0 object-contain" />
      ) : tower ? (
        <TowerLetterEmblem tone={tone} />
      ) : (
        <BrandEmblem />
      )}
      {tower ? (
        // wordmark: the first word large, the rest small and spaced, as a logo sets it
        <span className="min-w-0 leading-none">
          <span className={cn('font-display block truncate text-[22px] font-bold sm:text-2xl', tone === 'dark' ? 'text-white' : 'text-site-ink')}>{first}</span>
          {rest && (
            <span className={cn('mt-1 block truncate text-[9.5px] font-semibold tracking-[0.3em] uppercase sm:text-[10px]', tone === 'dark' ? 'text-site-brass' : 'text-site-brass-dark')}>
              {rest}
            </span>
          )}
        </span>
      ) : (
        <span className={cn('font-display truncate text-lg leading-none font-semibold sm:text-xl', tone === 'dark' ? 'text-white' : 'text-site-ink')}>
          {name}
        </span>
      )}
    </span>
  );
}
