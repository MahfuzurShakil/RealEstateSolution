'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import Link from 'next/link';
import {
  Building2,
  CalendarClock,
  FileSignature,
  FileText,
  Layers,
  Map,
  UserRound,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { BOOKING_STATUS_META, discountPct } from '@/lib/domain/booking';
import { FOLLOW_UP_META, LEAD_STATUS_META, followUpState } from '@/lib/domain/lead';
import { formatBdt, formatDate, formatPhone, todayLocal } from '@/lib/utils/format';
import { DemoDataCard } from '@/components/admin/DemoDataCard';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  bookingRepository,
  customerRepository,
  documentRepository,
  landRepository,
  landownerRepository,
  leadRepository,
  projectRepository,
  towerRepository,
  unitRepository,
} from '@/lib/repositories';
import { useMockSession } from '@/lib/auth/mock-session';

/**
 * Placeholder dashboard — proves the shell, the Dexie connection and the
 * repository layer all work end to end. Real KPI cards (Design Reference A.4
 * Pattern 2) arrive with Module 8.
 */
export default function AdminDashboardPage() {
  const { userName } = useMockSession();

  const today = todayLocal();

  /** The sales team's daily task list (Section 4.4). */
  const followUps = useLiveQuery(() => leadRepository.followUpQueue(today), [today]);
  /** Bookings a manager has to sign off (Section 5.4). */
  const pendingApprovals = useLiveQuery(
    () => bookingRepository.list({ awaiting_approval: true }),
    [],
  );
  const customerNameById = useLiveQuery(
    async () =>
      Object.fromEntries((await customerRepository.getAll()).map((c) => [c.id, c.name])),
    [],
  );

  const counts = useLiveQuery(
    async () => ({
      lands: await landRepository.count(),
      landowners: await landownerRepository.count(),
      documents: await documentRepository.count(),
      projects: await projectRepository.count(),
      towers: await towerRepository.count(),
      units: await unitRepository.count(),
      leads: await leadRepository.count(),
      bookings: await bookingRepository.count(),
    }),
    [],
  );

  const tiles = [
    { label: 'Lands', value: counts?.lands, icon: Map, tint: 'bg-admin-100 text-admin-700' },
    {
      label: 'Landowners',
      value: counts?.landowners,
      icon: Users,
      tint: 'bg-orange-100 text-orange-600',
    },
    {
      label: 'Projects',
      value: counts?.projects,
      icon: Building2,
      tint: 'bg-blue-100 text-blue-600',
    },
    {
      label: 'Units',
      value: counts?.units,
      icon: Layers,
      tint: 'bg-emerald-100 text-emerald-600',
    },
    {
      label: 'Leads',
      value: counts?.leads,
      icon: UserRound,
      tint: 'bg-violet-100 text-violet-600',
    },
    {
      label: 'Bookings',
      value: counts?.bookings,
      icon: FileSignature,
      tint: 'bg-rose-100 text-rose-600',
    },
    {
      label: 'Documents',
      value: counts?.documents,
      icon: FileText,
      tint: 'bg-slate-100 text-slate-600',
    },
  ];

  return (
    <>
      <PageHeader
        title={`Hello, ${userName}`}
        subtitle="Modules 1–4 are live — the rest follow the roadmap, one at a time."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {tiles.map(({ label, value, icon: Icon, tint }) => (
          <Card key={label}>
            <div className={`mb-4 grid size-11 place-items-center rounded-xl ${tint}`}>
              <Icon className="size-5" />
            </div>
            <p className="text-sm text-ink-muted">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{value ?? '—'}</p>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-ink">Follow-ups due</h2>
          <Link href="/admin/leads" className="text-sm text-admin-700 hover:underline">
            All leads
          </Link>
        </div>
        {followUps === undefined ? (
          <p className="text-sm text-ink-muted">Loading…</p>
        ) : followUps.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Nothing overdue or due today — the sales team is caught up.
          </p>
        ) : (
          <ul className="space-y-2">
            {followUps.map(({ lead, date }) => {
              const state = followUpState(date, today);
              return (
                <li key={lead.id}>
                  <Link
                    href={`/admin/leads/${lead.id}`}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-hairline p-3 transition-colors hover:bg-admin-50/60"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-admin-50 text-admin-600">
                      <CalendarClock className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{lead.name}</p>
                      <p className="text-xs text-ink-muted">
                        {lead.code} · {formatPhone(lead.phone)} · {formatDate(date)}
                      </p>
                    </div>
                    <Badge tone={LEAD_STATUS_META[lead.status].tone}>
                      {LEAD_STATUS_META[lead.status].label}
                    </Badge>
                    {state !== 'none' && (
                      <Badge tone={FOLLOW_UP_META[state].tone}>{FOLLOW_UP_META[state].label}</Badge>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {pendingApprovals && pendingApprovals.length > 0 && (
        <Card className="mt-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-ink">Discount approvals waiting</h2>
            <Link href="/admin/bookings" className="text-sm text-admin-700 hover:underline">
              All bookings
            </Link>
          </div>
          <ul className="space-y-2">
            {pendingApprovals.map((booking) => (
              <li key={booking.id}>
                <Link
                  href={`/admin/bookings/${booking.id}`}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-hairline p-3 transition-colors hover:bg-admin-50/60"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-amber-50 text-amber-600">
                    <FileSignature className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {customerNameById?.[booking.customer_id] ?? booking.code}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {booking.code} · {formatBdt(booking.discount_amount)} discount ·{' '}
                      {discountPct(booking.base_price, booking.discount_amount).toFixed(1)}%
                    </p>
                  </div>
                  <Badge tone={BOOKING_STATUS_META[booking.status].tone}>
                    {BOOKING_STATUS_META[booking.status].label}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <DemoDataCard />

      <Card>
        <h2 className="text-base font-semibold text-ink">What is wired up</h2>
        <ul className="mt-3 space-y-2 text-sm text-ink-muted">
          <li>• Shared IndexedDB (Dexie) — one database for both portals</li>
          <li>• Tables: documents, lookup_values, company_settings, lands, landowners, land_owner_mapping, land_jv_details, projects, land_project_mapping, towers, units, users, leads, lead_activities, customers, bookings, discount_approval_rules</li>
          <li>• Repository layer — UI never calls Dexie directly</li>
          <li>• Admin shell: sidebar groups for all eight modules, topbar with role simulation</li>
          <li>• Module 1 — Land Management, preloaded with sample records</li>
          <li>• Module 2 — Project Creation: towers, bulk unit generation, JV allocation check</li>
          <li>• Module 3 — Sales / Lead / CRM: phone dedup, follow-up log, lost &amp; revive</li>
          <li>• Module 4 — Booking &amp; Customer: discount approval gating, unit reservation</li>
        </ul>
      </Card>
      </div>
    </>
  );
}
