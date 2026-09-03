'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Building2,
  CalendarClock,
  Phone,
  Plus,
  Search,
  UserRound,
  Wallet,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, SelectInput, TextInput } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination, usePagination } from '@/components/ui/Pagination';
import { ResultCard } from '@/components/ui/ResultCard';
import { ResultsLayout, ViewToggle, type ViewMode } from '@/components/ui/ViewToggle';
import { useMockSession } from '@/lib/auth/mock-session';
import { LEAD_SOURCES, LEAD_STATUSES, type LeadSource, type LeadStatus } from '@/lib/db/types';
import {
  FOLLOW_UP_META,
  LEAD_SOURCE_LABEL,
  LEAD_STATUS_META,
  followUpState,
} from '@/lib/domain/lead';
import {
  leadRepository,
  projectRepository,
  userRepository,
} from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatDate, formatPhone, todayLocal } from '@/lib/utils/format';

type SortKey = 'newest' | 'oldest' | 'follow_up' | 'name';

/** Lead list — Design Reference A.7, with the daily follow-up queue on top. */
export default function LeadsListPage() {
  const today = todayLocal();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<LeadStatus | 'all'>('all');
  const [source, setSource] = useState<LeadSource | 'all'>('all');
  const [assignedTo, setAssignedTo] = useState<string>('all');
  const [projectId, setProjectId] = useState('');
  const [followUp, setFollowUp] = useState<'all' | 'overdue' | 'today'>('all');
  const [sort, setSort] = useState<SortKey>('newest');
  const [view, setView] = useState<ViewMode>('list');

  const leads = useLiveQuery(
    () =>
      leadRepository.list(
        {
          search,
          status,
          source,
          assigned_to: assignedTo,
          interested_project_id: projectId || undefined,
          follow_up: followUp,
        },
        today,
      ),
    [search, status, source, assignedTo, projectId, followUp, today],
  );

  const allLeads = useLiveQuery(() => leadRepository.getAll(), []);
  /** every lead's next follow-up date — drives the per-card badge and the sort */
  const dueMap = useLiveQuery(() => leadRepository.followUpDueMap(), []);
  /** when each lead was last actually worked — see C-3 on the card footer */
  const lastActivityMap = useLiveQuery(() => leadRepository.lastActivityMap(), []);
  /*
   * The banner reads the same queue the dashboard does, rather than counting
   * raw follow-up dates: a lead that is booked, lost, or already carries a
   * live booking is not somebody to ring today, and counting it here made the
   * two screens disagree about how much work was outstanding.
   */
  const queueRows = useLiveQuery(() => leadRepository.followUpQueue(today), [today]);
  const salesTeam = useLiveQuery(() => userRepository.salesTeam(), []);
  const projects = useLiveQuery(() => projectRepository.list(), []);

  const teamById = useMemo(
    () => new Map((salesTeam ?? []).map((u) => [u.id, u])),
    [salesTeam],
  );
  const projectById = useMemo(
    () => new Map((projects ?? []).map((p) => [p.id, p])),
    [projects],
  );

  /** Overdue, due-today and unassigned counts, for the queue banner. */
  const queue = useMemo(() => {
    let overdue = 0;
    let dueToday = 0;
    for (const { date } of queueRows ?? []) {
      if (date < today) overdue += 1;
      else if (date === today) dueToday += 1;
    }
    /*
     * Section 9.6 makes assignment a manager's job, and an unassigned lead is
     * nobody's problem until somebody notices. The filter for them existed;
     * nothing ever pointed at it, so a website enquiry could sit unowned for
     * days without appearing on any count.
     */
    const unassigned = (allLeads ?? []).filter(
      (lead) => !lead.assigned_to && lead.status !== 'lost' && lead.status !== 'booked',
    ).length;
    return { overdue, dueToday, unassigned };
  }, [queueRows, allLeads, today]);

  const rows = useMemo(() => {
    const list = [...(leads ?? [])];
    switch (sort) {
      case 'oldest':
        return list.sort((a, b) => a.created_at.localeCompare(b.created_at));
      case 'name':
        return list.sort((a, b) => a.name.localeCompare(b.name));
      case 'follow_up':
        return list.sort((a, b) => {
          const da = dueMap?.get(a.id) ?? '9999-12-31';
          const dbb = dueMap?.get(b.id) ?? '9999-12-31';
          return da.localeCompare(dbb);
        });
      default:
        return list.sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
  }, [leads, sort, dueMap]);

  const paged = usePagination(rows);
  const { userId } = useMockSession();

  /*
   * Bulk assignment (C-4) works on the filtered set, not a checkbox selection,
   * because that is the shape of the job it exists for: filter to this
   * morning's website enquiries, or to everything unassigned, and hand the lot
   * to one executive. It covers every matching lead, not just the visible
   * page, and says so before it runs.
   */
  const [bulkAssignee, setBulkAssignee] = useState<string>('');
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const loading = leads === undefined;
  const hasAny = (allLeads?.length ?? 0) > 0;
  const filtersActive =
    Boolean(search) ||
    status !== 'all' ||
    source !== 'all' ||
    assignedTo !== 'all' ||
    Boolean(projectId) ||
    followUp !== 'all';

  function resetFilters() {
    setSearch('');
    setStatus('all');
    setSource('all');
    setAssignedTo('all');
    setProjectId('');
    setFollowUp('all');
  }

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle="Inquiries from the website, WhatsApp, Facebook and walk-ins, through to booking or lost."
        action={
          <Link href="/admin/leads/new">
            <Button>
              <Plus className="size-4" /> Add Lead
            </Button>
          </Link>
        }
      />

      {(queue.overdue > 0 || queue.dueToday > 0 || queue.unassigned > 0) && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-hairline bg-white p-4 shadow-sm">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-admin-50 text-admin-600">
            <CalendarClock className="size-5" />
          </span>
          <p className="mr-auto text-sm text-ink">
            <span className="font-semibold">Today&apos;s follow-ups:</span>{' '}
            {queue.overdue > 0 && (
              <span className="text-red-600">{queue.overdue} overdue</span>
            )}
            {queue.overdue > 0 && queue.dueToday > 0 && ' · '}
            {queue.dueToday > 0 && (
              <span className="text-amber-600">{queue.dueToday} due today</span>
            )}
            {(queue.overdue > 0 || queue.dueToday > 0) && queue.unassigned > 0 && ' · '}
            {queue.unassigned > 0 && (
              <span className="text-ink-muted">{queue.unassigned} unassigned</span>
            )}
            {queue.overdue === 0 && queue.dueToday === 0 && queue.unassigned > 0 && (
              <span className="text-ink-muted"> — nothing to call today</span>
            )}
          </p>
          {queue.overdue > 0 && (
            <Button
              size="sm"
              variant={followUp === 'overdue' ? 'primary' : 'outline'}
              onClick={() => setFollowUp(followUp === 'overdue' ? 'all' : 'overdue')}
            >
              Show overdue
            </Button>
          )}
          {queue.dueToday > 0 && (
            <Button
              size="sm"
              variant={followUp === 'today' ? 'primary' : 'outline'}
              onClick={() => setFollowUp(followUp === 'today' ? 'all' : 'today')}
            >
              Show today
            </Button>
          )}
          {queue.unassigned > 0 && (
            <Button
              size="sm"
              variant={assignedTo === 'unassigned' ? 'primary' : 'outline'}
              onClick={() => setAssignedTo(assignedTo === 'unassigned' ? 'all' : 'unassigned')}
            >
              Show unassigned
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <aside className="min-w-0 space-y-5">
          <Card>
            <h2 className="mb-4 text-sm font-semibold text-ink">Filters</h2>
            <div className="space-y-4">
              <Field label="Search">
                <div className="relative">
                  <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <TextInput
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Name, phone, code…"
                    className="pr-9"
                  />
                </div>
              </Field>

              <Field label="Status">
                <SelectInput
                  value={status}
                  onChange={(e) => setStatus(e.target.value as LeadStatus | 'all')}
                >
                  <option value="all">All statuses</option>
                  {LEAD_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {LEAD_STATUS_META[s].label}
                    </option>
                  ))}
                </SelectInput>
              </Field>

              <Field label="Source">
                <SelectInput
                  value={source}
                  onChange={(e) => setSource(e.target.value as LeadSource | 'all')}
                >
                  <option value="all">All sources</option>
                  {LEAD_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {LEAD_SOURCE_LABEL[s]}
                    </option>
                  ))}
                </SelectInput>
              </Field>

              <Field label="Assigned To">
                <SelectInput value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                  <option value="all">Everyone</option>
                  <option value="unassigned">Unassigned</option>
                  {(salesTeam ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </SelectInput>
              </Field>

              <Field label="Interested Project">
                <SelectInput value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  <option value="">All projects</option>
                  {(projects ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </SelectInput>
              </Field>

              <Field label="Follow-up">
                <SelectInput
                  value={followUp}
                  onChange={(e) => setFollowUp(e.target.value as 'all' | 'overdue' | 'today')}
                >
                  <option value="all">Any</option>
                  <option value="overdue">Overdue only</option>
                  <option value="today">Due today</option>
                </SelectInput>
              </Field>

              {filtersActive && (
                <Button variant="outline" size="sm" className="w-full" onClick={resetFilters}>
                  Clear filters
                </Button>
              )}
            </div>
          </Card>
        </aside>

        <section className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-muted">
              {loading ? 'Loading…' : `Showing ${rows.length} lead${rows.length === 1 ? '' : 's'}`}
            </p>
            <div className="flex items-center gap-2">
              <ViewToggle value={view} onChange={setView} />
              <SelectInput
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="w-auto max-w-[13rem]"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="follow_up">Follow-up soonest</option>
                <option value="name">Name A–Z</option>
              </SelectInput>
            </div>
          </div>

          {!loading && rows.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-hairline bg-canvas/60 p-3">
              <UserRound className="size-4 shrink-0 text-admin-600" />
              <p className="text-sm text-ink">
                Assign all{' '}
                <span className="font-semibold">
                  {rows.length} matching lead{rows.length === 1 ? '' : 's'}
                </span>{' '}
                to
              </p>
              <SelectInput
                value={bulkAssignee}
                onChange={(e) => setBulkAssignee(e.target.value)}
                className="h-9 w-auto py-1 text-sm"
                aria-label="Assign every matching lead to"
              >
                <option value="">Choose a person…</option>
                <option value="__clear__">Nobody — clear the assignment</option>
                {(salesTeam ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </SelectInput>
              <Button
                size="sm"
                disabled={!bulkAssignee || bulkBusy}
                onClick={() => setBulkConfirm(true)}
              >
                {bulkBusy ? 'Assigning…' : 'Assign'}
              </Button>
              <p className="w-full text-xs text-ink-muted">
                Everything the filters match, not just this page. Each lead gets its own
                assignment entry in its follow-up log.
              </p>
            </div>
          )}

          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-28 animate-pulse rounded-2xl border border-hairline bg-white"
                />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={UserRound}
              title={hasAny ? 'No lead matches these filters' : 'No lead yet'}
              description={
                hasAny
                  ? 'Try clearing a filter or searching for a different name or number.'
                  : 'Add the first inquiry — website, WhatsApp or walk-in — to start tracking it.'
              }
              action={
                hasAny ? (
                  <Button variant="outline" onClick={resetFilters}>
                    Clear filters
                  </Button>
                ) : (
                  <Link href="/admin/leads/new">
                    <Button>
                      <Plus className="size-4" /> Add Lead
                    </Button>
                  </Link>
                )
              }
            />
          ) : (
            <>
              <ResultsLayout view={view}>
                {paged.pageRows.map((lead) => {
                const meta = LEAD_STATUS_META[lead.status];
                const due = dueMap?.get(lead.id) ?? null;
                const state = followUpState(due, today);
                const lastTouched = lastActivityMap?.get(lead.id) ?? null;
                const assignee = lead.assigned_to ? teamById.get(lead.assigned_to) : undefined;
                const project = lead.interested_project_id
                  ? projectById.get(lead.interested_project_id)
                  : undefined;

                  return (
                    <ResultCard
                      key={lead.id}
                      href={`/admin/leads/${lead.id}`}
                      view={view}
                      code={lead.code}
                      title={lead.name}
                      accent={cn(
                        state === 'overdue' && 'border-l-4 border-l-red-400',
                        state === 'today' && 'border-l-4 border-l-amber-400',
                      )}
                      status={
                        <>
                          {state !== 'none' && (
                            <Badge tone={FOLLOW_UP_META[state].tone}>
                              <CalendarClock className="size-3.5" />
                              {FOLLOW_UP_META[state].label}
                            </Badge>
                          )}
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                        </>
                      }
                      footer={
                        <>
                          Added {formatDate(lead.created_at)}
                          {/*
                            "Added" and "Follow-up" say when the lead arrived
                            and when it is next due — neither says when anyone
                            last touched it, which is how a sales manager spots
                            the ones going cold.
                          */}
                          {lastTouched && ` · Last activity ${formatDate(lastTouched)}`}
                          {!lastTouched && ' · No activity logged'}
                          {due && ` · Follow-up ${formatDate(due)}`}
                        </>
                      }
                      facts={
                        <>
                          <Badge>
                            <Phone className="size-3.5" />
                            {formatPhone(lead.phone)}
                          </Badge>
                          <Badge>{LEAD_SOURCE_LABEL[lead.source]}</Badge>
                          {lead.budget_range && (
                            <Badge>
                              <Wallet className="size-3.5" />
                              {lead.budget_range}
                            </Badge>
                          )}
                          {project && (
                            <Badge tone="teal">
                              <Building2 className="size-3.5" />
                              {project.name}
                            </Badge>
                          )}
                          <Badge tone={assignee ? 'blue' : 'amber'}>
                            <UserRound className="size-3.5" />
                            {assignee?.name ?? 'Unassigned'}
                          </Badge>
                        </>
                      }
                    />
                  );
                })}
              </ResultsLayout>

              <Pagination
                page={paged.page}
                pageCount={paged.pageCount}
                pageSize={paged.pageSize}
                total={paged.total}
                from={paged.from}
                to={paged.to}
                onPageChange={paged.setPage}
                onPageSizeChange={paged.setPageSize}
                label="leads"
              />
            </>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={bulkConfirm}
        title={`Assign ${rows.length} lead${rows.length === 1 ? '' : 's'}`}
        subtitle={
          bulkAssignee === '__clear__'
            ? 'Clearing the assignment'
            : (salesTeam ?? []).find((u) => u.id === bulkAssignee)?.name
        }
        message={`Every lead the filters currently match will be reassigned, including the ones on later pages. Each one is logged in its own follow-up trail, so this is visible afterwards rather than silent.`}
        confirmLabel="Assign them"
        onCancel={() => setBulkConfirm(false)}
        onConfirm={async () => {
          setBulkBusy(true);
          try {
            await leadRepository.bulkAssign(
              rows.map((l) => l.id),
              bulkAssignee === '__clear__' ? null : bulkAssignee,
              userId,
            );
            setBulkConfirm(false);
            setBulkAssignee('');
          } finally {
            setBulkBusy(false);
          }
        }}
      />
    </>
  );
}
