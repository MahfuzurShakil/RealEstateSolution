import Link from 'next/link';
import { ArrowUpRight, MapPin } from 'lucide-react';
import { formatDay, formatPct, type HoldingView } from '@/lib/domain/investor-portal';
import { HealthPill, Money, ProgressBar } from './ui';

/** One project the customer holds shares in: picture, ownership and how far the payments are. */
export function HoldingCard({ view }: { view: HoldingView }) {
  const { holding, project, next } = view;
  return (
    <Link
      href={`/investor/investments/${holding.code}`}
      className="group flex flex-col overflow-hidden rounded-3xl border border-site-line bg-white shadow-site-1 transition-[box-shadow,transform] duration-300 ease-site-out hover:-translate-y-0.5 hover:shadow-site-2"
    >
      <div className="relative aspect-[16/8] overflow-hidden bg-site-line">
        {/* eslint-disable-next-line @next/next/no-img-element -- mock stock photo */}
        <img src={project.image} alt="" loading="lazy" className="size-full object-cover transition-transform duration-700 ease-site-out group-hover:scale-105" />
        <div aria-hidden className="absolute inset-0 bg-linear-to-t from-site-night/80 via-site-night/10 to-transparent" />
        <div className="absolute top-3 left-3">
          <HealthPill health={view.health} className="bg-white/95" />
        </div>
        <div className="absolute right-4 bottom-3 left-4 text-white">
          <p className="text-xs font-semibold tracking-[0.14em] text-site-brass uppercase">{project.category}</p>
          <p className="font-display mt-0.5 truncate text-xl font-semibold">{project.name}</p>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className="flex items-center gap-1.5 text-sm text-site-muted">
          <MapPin className="size-4 shrink-0" aria-hidden /> <span className="truncate">{project.location}</span>
        </p>
        <div className="mt-4 grid grid-cols-[auto_auto_1fr] gap-x-6 border-y border-site-line py-4">
          <div>
            <p className="text-xs text-site-muted">Shares</p>
            <p className="tabular mt-0.5 font-semibold">{holding.shares}</p>
          </div>
          <div>
            <p className="text-xs text-site-muted">Ownership</p>
            <p className="tabular mt-0.5 font-semibold">{formatPct(holding.share_pct)}</p>
          </div>
          <div>
            <p className="text-xs text-site-muted">Total price</p>
            <Money amount={holding.total_price} className="mt-0.5 block font-semibold" />
          </div>
        </div>
        <div className="mt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-site-muted">
              Paid <Money amount={view.paid} className="font-semibold text-site-ink" />
            </span>
            <span className="tabular font-semibold">{view.progress_pct}%</span>
          </div>
          <ProgressBar pct={view.progress_pct} className="mt-2" tone={view.health === 'overdue' ? 'danger' : 'primary'} />
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 pt-1 text-sm">
          {next ? (
            <span className="text-site-muted">
              {next.status === 'overdue' ? 'Overdue since' : 'Next due'}{' '}
              <span className={next.status === 'overdue' ? 'font-semibold text-site-danger' : 'font-semibold text-site-ink'}>{formatDay(next.due_date)}</span>
            </span>
          ) : (
            <span className="font-medium text-site-primary-dark">All installments paid</span>
          )}
          <span className="inline-flex items-center gap-1 font-semibold text-site-primary">
            Details <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
          </span>
        </div>
      </div>
    </Link>
  );
}
