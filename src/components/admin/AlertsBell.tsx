'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Bell, CircleAlert } from 'lucide-react';
import { useMockSession } from '@/lib/auth/mock-session';
import { canView } from '@/lib/domain/access';
import { ALERT_KIND_LABEL, costAlerts, type AlertKind } from '@/lib/repositories';
import { usePurchaseMode } from '@/lib/settings/use-purchase-mode';
import { cn } from '@/lib/utils/cn';

/**
 * The alerts bell (DIRECT-PURCHASE-PLAN.md B6): over budget, budget nearly
 * used, spending ahead of work, overdue payments and low fund. The site team
 * sees budget alerts, finance sees money alerts; each links to the screen
 * where it is dealt with.
 */
export function AlertsBell() {
  const { role } = useMockSession();
  const { direct } = usePurchaseMode();
  const seesSite = canView(role, 'site_progress');
  const seesMoney = canView(role, 'finance_expense');
  const all = useLiveQuery(() => (direct ? costAlerts() : Promise.resolve([])), [direct]);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<AlertKind | 'all'>('all');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!direct || (!seesSite && !seesMoney)) return null;
  const alerts = (all ?? []).filter((a) => (a.area === 'site' ? seesSite : seesMoney));
  const red = alerts.filter((a) => a.severity === 'red').length;
  const kinds = [...new Set(alerts.map((a) => a.kind))];
  const shown = alerts.filter((a) => kind === 'all' || a.kind === kind);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={`Alerts: ${alerts.length}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="relative grid size-9 place-items-center rounded-lg text-ink-muted hover:bg-admin-50 hover:text-admin-700"
      >
        <Bell className="size-5" />
        {alerts.length > 0 && (
          <span
            className={cn(
              'absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-semibold leading-[18px] text-white',
              red > 0 ? 'bg-red-500' : 'bg-amber-500',
            )}
          >
            {alerts.length > 99 ? '99+' : alerts.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-40 w-[min(420px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-hairline bg-white shadow-xl">
          <div className="border-b border-hairline px-4 py-3">
            <p className="text-sm font-semibold text-ink">Alerts</p>
            <p className="text-xs text-ink-muted">
              {alerts.length === 0 ? 'Nothing needs attention.' : `${red} urgent · ${alerts.length - red} to watch`}
            </p>
            {kinds.length > 1 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {(['all', ...kinds] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-[11px] font-medium',
                      kind === k ? 'bg-admin-500 text-white' : 'bg-slate-100 text-ink-muted hover:text-ink',
                    )}
                  >
                    {k === 'all' ? `All ${alerts.length}` : `${ALERT_KIND_LABEL[k]} ${alerts.filter((a) => a.kind === k).length}`}
                  </button>
                ))}
              </div>
            )}
          </div>
          <ul className="max-h-[60vh] divide-y divide-hairline overflow-y-auto">
            {shown.map((a) => (
              <li key={a.id}>
                <Link
                  href={a.href}
                  onClick={() => setOpen(false)}
                  className="flex gap-3 px-4 py-3 transition-colors hover:bg-admin-50/50"
                >
                  {a.severity === 'red' ? (
                    <CircleAlert className="mt-0.5 size-4 shrink-0 text-red-500" />
                  ) : (
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
                  )}
                  <span className="min-w-0">
                    <span className="block text-xs text-ink-muted">
                      {a.project_name} · {ALERT_KIND_LABEL[a.kind]}
                    </span>
                    <span className="block text-sm font-medium text-ink">{a.title}</span>
                    <span className="block text-xs text-ink-muted">{a.detail}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
