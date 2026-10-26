import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

/** Page width wrapper: 1280px, 16px gutters on phones, 24px from `sm`. */
export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('mx-auto w-full max-w-7xl px-4 sm:px-6', className)}>{children}</div>;
}

/**
 * Eyebrow + title + lead (+ optional action on the right). `accent` renders
 * 1–3 words of the title in the serif italic (§5.2): pass the title split in two.
 */
export function SectionHeader({
  eyebrow,
  title,
  accent,
  lead,
  action,
  align = 'left',
  tone = 'light',
  as: Heading = 'h2',
  className,
}: {
  eyebrow?: string;
  title: string;
  accent?: string;
  lead?: string;
  action?: ReactNode;
  align?: 'left' | 'center';
  tone?: 'light' | 'dark';
  as?: 'h1' | 'h2';
  className?: string;
}) {
  const center = align === 'center';
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-6', center && 'justify-center text-center', className)}>
      <div className={cn('max-w-2xl', center && 'mx-auto')}>
        {eyebrow && (
          <p
            className={cn(
              'text-xs font-semibold tracking-[0.18em] uppercase',
              tone === 'dark' ? 'text-site-brass' : 'text-site-brass-dark',
            )}
          >
            {eyebrow}
          </p>
        )}
        <Heading
          className={cn(
            'mt-3 text-[28px] leading-[1.1] font-semibold md:text-4xl',
            Heading === 'h1' && 'text-[34px] md:text-5xl',
            tone === 'dark' ? 'text-white' : 'text-site-ink',
          )}
        >
          {title}
          {accent && (
            <>
              {' '}
              <em className="font-accent font-normal tracking-normal text-site-primary italic">{accent}</em>
            </>
          )}
        </Heading>
        {lead && (
          <p className={cn('mt-4 text-base leading-relaxed md:text-lg', tone === 'dark' ? 'text-white/70' : 'text-site-muted')}>{lead}</p>
        )}
      </div>
      {action && !center && <div className="shrink-0">{action}</div>}
    </div>
  );
}
