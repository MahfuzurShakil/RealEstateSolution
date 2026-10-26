import { cn } from '@/lib/utils/cn';
import type { PublicCompanyInfo } from '@/lib/repositories/public/content.public.repository';

/**
 * The developer's logo + name (§0.1). Uses the logo from Settings → Company when
 * one is set; otherwise a monogram tile from the name's first letter, so a new
 * client looks branded on day one without any code change.
 */
export function BrandMark({ company, tone = 'light', className }: { company: PublicCompanyInfo | undefined; tone?: 'light' | 'dark'; className?: string }) {
  if (!company) return <span className={cn('block h-10 w-44 rounded-lg bg-site-soft', tone === 'dark' && 'bg-white/10', className)} />;
  const name = company.company_name;
  const initial = name.trim().charAt(0).toUpperCase() || '•';
  return (
    <span className={cn('flex min-w-0 items-center gap-2.5', className)}>
      {company.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- logo is any URL typed in Settings
        <img src={company.logo_url} alt="" className="h-10 w-auto max-w-[120px] shrink-0 object-contain" />
      ) : (
        <span
          aria-hidden
          className="font-display grid size-10 shrink-0 place-items-center rounded-xl bg-site-primary text-xl font-bold text-white shadow-site-1"
        >
          {initial}
        </span>
      )}
      <span className={cn('font-display truncate text-lg leading-none font-semibold sm:text-xl', tone === 'dark' ? 'text-white' : 'text-site-ink')}>
        {name}
      </span>
    </span>
  );
}
