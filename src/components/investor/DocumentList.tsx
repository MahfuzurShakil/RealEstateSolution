import Link from 'next/link';
import { ArrowUpRight, Award, CalendarRange, FileSignature, Lock, ScrollText, type LucideIcon } from 'lucide-react';
import { formatDay, type CustomerDocument } from '@/lib/domain/investor-portal';

const ICON: Record<CustomerDocument['kind'], LucideIcon> = {
  agreement: FileSignature,
  deed: ScrollText,
  schedule: CalendarRange,
  certificate: Award,
};

export function DocumentList({ docs, projectName }: { docs: CustomerDocument[]; projectName?: (holdingCode: string) => string | undefined }) {
  return (
    <ul className="divide-y divide-site-line">
      {docs.map((d) => {
        const Icon = ICON[d.kind];
        const body = (
          <>
            <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${d.available ? 'bg-site-primary-soft text-site-primary' : 'bg-site-sold-soft text-site-faint'}`}>
              <Icon className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{d.title}</span>
              <span className="block text-sm text-site-muted">
                {projectName?.(d.holding_code) ? `${projectName(d.holding_code)} · ` : ''}
                {d.available ? `Issued ${formatDay(d.issued_on)}` : 'Issued once every installment is paid'}
              </span>
            </span>
            {d.available ? (
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-site-primary">
                View <ArrowUpRight className="size-4" aria-hidden />
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-site-sold-soft px-3 py-1 text-xs font-semibold text-site-sold">
                <Lock className="size-3.5" aria-hidden /> Not yet issued
              </span>
            )}
          </>
        );
        return (
          <li key={d.id}>
            {d.available ? (
              <Link href={`/investor/documents/${d.id}`} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-site-ivory sm:px-6">
                {body}
              </Link>
            ) : (
              <div className="flex items-center gap-4 px-5 py-4 sm:px-6">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
