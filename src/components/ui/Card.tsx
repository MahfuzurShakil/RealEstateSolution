import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

/** White card on the mint canvas, hairline border, subtle elevation (A.1). */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-2xl border border-hairline bg-white p-5 shadow-sm', className)}>
      {children}
    </div>
  );
}

export function CardHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {action}
    </div>
  );
}
