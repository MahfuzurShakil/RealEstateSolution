'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  Pencil,
  Phone,
  Trash2,
  UserRound,
} from 'lucide-react';
import { DocumentsPanel } from '@/components/admin/documents/DocumentsPanel';
import { LeadActivityPanel } from '@/components/admin/leads/LeadActivityPanel';
import { LeadStatusCard } from '@/components/admin/leads/LeadStatusCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SelectInput } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { useMockSession } from '@/lib/auth/mock-session';
import type { User } from '@/lib/db/types';
import {
  FOLLOW_UP_META,
  LEAD_SOURCE_LABEL,
  LEAD_STATUS_META,
  followUpState,
} from '@/lib/domain/lead';
import { UNIT_STATUS_META } from '@/lib/domain/project';
import { leadRepository, userRepository } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt, formatDate, formatPhone, todayLocal } from '@/lib/utils/format';

type Tab = 'overview' | 'activity' | 'documents';

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-hairline py-2.5 last:border-0">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="text-right text-sm font-medium text-ink">{value ?? '—'}</span>
    </div>
  );
}

/** Lead detail — Design Reference A.8 (sidebar cards + tabbed main column). */
export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { userId } = useMockSession();
  const [tab, setTab] = useState<Tab>('overview');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [salesTeam, setSalesTeam] = useState<User[]>([]);

  const lead = useLiveQuery(() => leadRepository.getWithRelations(id), [id]);

  useEffect(() => {
    userRepository.salesTeam().then(setSalesTeam);
  }, []);

  if (lead === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (!lead) {
    return (
      <Card>
        <p className="text-sm text-ink-muted">This lead no longer exists.</p>
        <Link href="/admin/leads" className="mt-3 inline-block">
          <Button variant="outline" size="sm">
            <ArrowLeft className="size-4" /> Back to leads
          </Button>
        </Link>
      </Card>
    );
  }

  const today = todayLocal();
  const state = followUpState(lead.next_follow_up, today);
  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'activity', label: `Follow-up (${lead.activities.length})` },
    { key: 'documents', label: 'Documents' },
  ];

  return (
    <>
      <Link
        href="/admin/leads"
        className="mb-4 inline-flex items-center gap-2 text-sm text-ink-muted hover:text-admin-700"
      >
        <ArrowLeft className="size-4" /> Back to leads
      </Link>

      <PageHeader
        title={lead.name}
        subtitle={`${lead.code} · ${LEAD_SOURCE_LABEL[lead.source]}`}
        action={
          <div className="flex gap-2">
            <a href={`tel:${lead.phone}`}>
              <Button variant="outline">
                <Phone className="size-4" /> Call
              </Button>
            </a>
            <Link href={`/admin/leads/${lead.id}/edit`}>
              <Button variant="outline">
                <Pencil className="size-4" /> Edit
              </Button>
            </Link>
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" /> Delete
            </Button>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 lg:order-1">
          <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-hairline bg-white p-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                  tab === t.key
                    ? 'bg-admin-500 text-white'
                    : 'text-ink-muted hover:bg-admin-50 hover:text-admin-700',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <div className="space-y-5">
              <Card>
                <CardHeader title="Buyer" />
                <Row label="Name" value={lead.name} />
                <Row label="Code" value={lead.code} />
                <Row
                  label="Phone"
                  value={
                    <a href={`tel:${lead.phone}`} className="text-admin-700 hover:underline">
                      {formatPhone(lead.phone)}
                    </a>
                  }
                />
                <Row
                  label="Email"
                  value={
                    lead.email ? (
                      <a href={`mailto:${lead.email}`} className="text-admin-700 hover:underline">
                        {lead.email}
                      </a>
                    ) : (
                      '—'
                    )
                  }
                />
                <Row label="Source" value={LEAD_SOURCE_LABEL[lead.source]} />
                <Row label="Budget range" value={lead.budget_range} />
                <Row label="First inquiry" value={formatDate(lead.created_at)} />
              </Card>

              <Card>
                <CardHeader title="Interest" />
                {lead.project ? (
                  <Link
                    href={`/admin/projects/${lead.project.id}`}
                    className="flex items-center gap-3 rounded-xl border border-hairline p-3 transition-colors hover:bg-admin-50/60"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-admin-50 text-admin-600">
                      <Building2 className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{lead.project.name}</p>
                      <p className="text-xs text-ink-muted">
                        {lead.project.code}
                        {lead.project.location_summary && ` · ${lead.project.location_summary}`}
                      </p>
                    </div>
                  </Link>
                ) : (
                  <p className="text-sm text-ink-muted">
                    No project picked yet — the buyer is still deciding.
                  </p>
                )}

                {lead.unit && (
                  <div className="mt-3 rounded-xl border border-hairline p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-ink">Unit {lead.unit.code}</p>
                      <Badge tone={UNIT_STATUS_META[lead.unit.status].tone}>
                        {UNIT_STATUS_META[lead.unit.status].label}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-ink-muted">
                      {lead.unit.unit_type} · {lead.unit.size_sqft} sqft
                      {lead.unit.facing && ` · ${lead.unit.facing} facing`} ·{' '}
                      {formatBdt(lead.unit.base_price, { compact: true })}
                    </p>
                  </div>
                )}

                {lead.inquiry_message && (
                  <div className="mt-4 border-t border-hairline pt-4">
                    <p className="mb-1 text-sm font-medium text-ink">Inquiry message</p>
                    <p className="whitespace-pre-wrap text-sm text-ink-muted">
                      {lead.inquiry_message}
                    </p>
                  </div>
                )}
              </Card>
            </div>
          )}

          {tab === 'activity' && (
            <Card>
              <CardHeader title="Follow-up log" />
              <LeadActivityPanel leadId={lead.id} />
            </Card>
          )}

          {tab === 'documents' && (
            <Card>
              <CardHeader title="Documents" />
              <DocumentsPanel entityType="lead" entityId={lead.id} />
            </Card>
          )}
        </div>

        <aside className="min-w-0 space-y-5 lg:order-2">
          <LeadStatusCard lead={lead} />

          <Card>
            <CardHeader title="Assigned To" />
            <SelectInput
              value={lead.assigned_to ?? ''}
              onChange={(e) => leadRepository.assign(lead.id, e.target.value || null, userId)}
            >
              <option value="">Unassigned</option>
              {salesTeam.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </SelectInput>
            {lead.assignee ? (
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-hairline p-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-admin-50 text-admin-600">
                  <UserRound className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{lead.assignee.name}</p>
                  <p className="truncate text-xs text-ink-muted">
                    {formatPhone(lead.assignee.phone)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-xs text-ink-muted">
                Nobody owns this lead yet — assign a Sales Executive so it shows up on their list.
              </p>
            )}
          </Card>

          <Card>
            <CardHeader title="Next Follow-up" />
            {lead.next_follow_up ? (
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    'grid size-10 shrink-0 place-items-center rounded-xl',
                    state === 'overdue'
                      ? 'bg-red-50 text-red-600'
                      : state === 'today'
                        ? 'bg-amber-50 text-amber-600'
                        : 'bg-admin-50 text-admin-600',
                  )}
                >
                  <CalendarClock className="size-5" />
                </span>
                <div>
                  <p className="text-sm font-medium text-ink">
                    {formatDate(lead.next_follow_up)}
                  </p>
                  {state !== 'none' && (
                    <Badge tone={FOLLOW_UP_META[state].tone}>{FOLLOW_UP_META[state].label}</Badge>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink-muted">
                {lead.status === 'booked' || lead.status === 'lost'
                  ? 'The lead is closed — no follow-up pending.'
                  : 'Nothing scheduled. Log an activity with a follow-up date to put it on the task list.'}
              </p>
            )}
          </Card>

          <Card>
            <CardHeader title="Record" />
            <Row label="Status" value={LEAD_STATUS_META[lead.status].label} />
            <Row label="Activities" value={lead.activities.length} />
            <Row label="Created" value={formatDate(lead.created_at)} />
            <Row label="Last updated" value={formatDate(lead.updated_at)} />
          </Card>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${lead.code}`}
        subtitle={lead.name}
        confirmLabel="Delete lead"
        message="This deletes the lead with its whole follow-up history and uploaded documents. Marking it lost keeps the history instead — that is usually what you want."
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await leadRepository.removeCascade(lead.id);
          router.push('/admin/leads');
        }}
      />
    </>
  );
}
