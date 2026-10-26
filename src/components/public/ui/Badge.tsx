import type { ReactNode } from 'react';
import { CircleCheck, Clock3, Lock } from 'lucide-react';
import { PUBLIC_SALES_BADGE_LABEL, type PublicSalesBadge } from '@/lib/domain/public-portal';
import { cn } from '@/lib/utils/cn';

/** Small pill. Tones map to the `site-` tokens; meaning is never colour-only (§5.1). */
export type BadgeTone = 'primary' | 'soft' | 'booked' | 'sold' | 'light' | 'dark' | 'brass';

const TONE: Record<BadgeTone, string> = {
  primary: 'bg-site-primary text-white',
  soft: 'bg-site-primary-soft text-site-primary-dark',
  booked: 'bg-site-booked-soft text-site-booked',
  sold: 'bg-site-sold-soft text-site-sold',
  light: 'bg-white/95 text-site-ink',
  dark: 'bg-site-night/80 text-white backdrop-blur',
  brass: 'bg-site-brass/15 text-site-brass-dark',
};

export function Badge({ tone = 'soft', icon, className, children }: { tone?: BadgeTone; icon?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold', TONE[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

const SALES: Record<PublicSalesBadge, { tone: BadgeTone; Icon: typeof CircleCheck }> = {
  on_sale: { tone: 'primary', Icon: CircleCheck },
  paused: { tone: 'booked', Icon: Clock3 },
  sold_out: { tone: 'sold', Icon: Lock },
};

/** On Sale / Bookings Paused / Sold Out — the same look on cards, hero and detail header. */
export function SalesBadge({ badge, className }: { badge: PublicSalesBadge; className?: string }) {
  const { tone, Icon } = SALES[badge];
  return (
    <Badge tone={tone} className={className} icon={<Icon className="size-3.5" aria-hidden />}>
      {PUBLIC_SALES_BADGE_LABEL[badge]}
    </Badge>
  );
}
