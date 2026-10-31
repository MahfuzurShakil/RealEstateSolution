'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AlertTriangle, BellOff, CheckCheck, CircleCheck, Clock3, HardHat, Landmark, MessageSquare, Smartphone, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/public/ui/Button';
import { formatDay, type NotificationKind } from '@/lib/domain/investor-portal';
import { investorRepository } from '@/lib/repositories/investor/investor.mock.repository';
import { cn } from '@/lib/utils/cn';
import { useCustomerPortal } from '../CustomerPortalProvider';
import { EmptyNote, PageHeading, Panel } from '../ui';

const KIND: Record<NotificationKind, { Icon: LucideIcon; cls: string; label: string }> = {
  overdue: { Icon: AlertTriangle, cls: 'bg-red-50 text-site-danger', label: 'Overdue' },
  reminder: { Icon: Clock3, cls: 'bg-site-booked-soft text-site-booked', label: 'Reminder' },
  payment: { Icon: CircleCheck, cls: 'bg-site-primary-soft text-site-primary', label: 'Payment' },
  offering: { Icon: Landmark, cls: 'bg-site-brass/15 text-site-brass-dark', label: 'Offering' },
  update: { Icon: HardHat, cls: 'bg-site-soft text-site-ink', label: 'Project update' },
};

const FILTERS: { id: 'all' | 'unread' | NotificationKind; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'reminder', label: 'Reminders' },
  { id: 'payment', label: 'Payments' },
];

export function NotificationsPage() {
  const { snapshot, notifications, unread } = useCustomerPortal();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all');
  const read = new Set(snapshot.read_notification_ids);
  const rows = notifications.filter((n) => (filter === 'all' ? true : filter === 'unread' ? !read.has(n.id) : n.kind === filter));

  return (
    <div className="space-y-8">
      <PageHeading
        eyebrow="Inbox"
        title="Notifications"
        description="Payment reminders, missed-payment alerts, receipts and project news. The same alerts reach you by SMS and email."
        actions={
          unread > 0 && (
            <Button variant="outline" size="sm" icon={<CheckCheck className="size-4" />} onClick={() => investorRepository.markRead(notifications.map((n) => n.id))}>
              Mark all as read
            </Button>
          )
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter notifications">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  'rounded-full border px-4 py-2 text-sm font-semibold transition-colors',
                  filter === f.id ? 'border-site-night bg-site-night text-white' : 'border-site-line bg-white text-site-muted hover:text-site-ink',
                )}
              >
                {f.label}
                {f.id === 'unread' && unread > 0 && <span className="tabular ml-1.5">{unread}</span>}
              </button>
            ))}
          </div>

          <Panel padded={false}>
            {rows.length ? (
              <ul className="divide-y divide-site-line">
                {rows.map((n) => {
                  const k = KIND[n.kind];
                  const isNew = !read.has(n.id);
                  return (
                    <li key={n.id}>
                      <Link
                        href={n.href}
                        onClick={() => investorRepository.markRead([n.id])}
                        className={cn('flex gap-4 px-5 py-4 transition-colors hover:bg-site-ivory sm:px-6', isNew && 'bg-site-primary-soft/30')}
                      >
                        <span className={cn('grid size-11 shrink-0 place-items-center rounded-2xl', k.cls)}>
                          <k.Icon className="size-5" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-x-2">
                            <span className="font-semibold">{n.title}</span>
                            {isNew && <span className="size-2 rounded-full bg-site-primary" aria-label="Unread" />}
                          </span>
                          <span className="mt-0.5 block text-[15px] text-site-muted">{n.body}</span>
                          <span className="mt-1 block text-xs text-site-faint">
                            {k.label} · {formatDay(n.date)}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyNote icon={BellOff} title="You are all caught up" body="Nothing here for this filter." />
            )}
          </Panel>
        </div>

        <Panel title="How we remind you">
          <ol className="space-y-4 text-sm">
            {[
              ['7 days before', 'Friendly reminder'],
              ['On the due date', 'Payment due today'],
              ['3 days late', 'Missed-payment alert'],
              ['After 7 days', 'Late fee added'],
              ['15 days late', 'Second notice and a call from our team'],
            ].map(([when, what], i) => (
              <li key={when} className="flex gap-3">
                <span className="tabular grid size-6 shrink-0 place-items-center rounded-full bg-site-night text-xs font-bold text-white">{i + 1}</span>
                <span>
                  <span className="block font-semibold">{when}</span>
                  <span className="text-site-muted">{what}</span>
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-5 flex gap-4 border-t border-site-line pt-4 text-sm text-site-muted">
            <span className="inline-flex items-center gap-1.5"><Smartphone className="size-4" aria-hidden /> SMS</span>
            <span className="inline-flex items-center gap-1.5"><MessageSquare className="size-4" aria-hidden /> Email</span>
          </div>
        </Panel>
      </div>
    </div>
  );
}
