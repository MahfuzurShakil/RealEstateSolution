'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Building2,
  ClipboardList,
  ListChecks,
  Package,
  Plus,
  Search,
  UserRound,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, SelectInput, TextInput } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination, usePagination } from '@/components/ui/Pagination';
import { ResultCard } from '@/components/ui/ResultCard';
import { ResultsLayout, ViewToggle, type ViewMode } from '@/components/ui/ViewToggle';
import { MATERIAL_REQUEST_STATUSES, type MaterialRequestStatus } from '@/lib/db/types';
import { MATERIAL_REQUEST_STATUS_META, requestTotals } from '@/lib/domain/site-progress';
import {
  materialRequestRepository,
  projectRepository,
  userRepository,
} from '@/lib/repositories';
import { formatDate } from '@/lib/utils/format';
import { useMockSession } from '@/lib/auth/mock-session';
import { canEdit } from '@/lib/domain/access';

type SortKey = 'newest' | 'oldest' | 'status' | 'project';

const SORT_LABELS: Record<SortKey, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  status: 'Status (pipeline order)',
  project: 'Project (A–Z)',
};

/** Material requests (Section 6.5) — the Site → Procurement queue. */
function MaterialRequestsPage() {
  const { role } = useMockSession();
  /*
   * 9.6 gives a Site Manager "Create (assigned)" and Procurement / the Project
   * Manager "Approve". Offering "Raise Request" to an approver blurs the one
   * split this workflow exists to keep, so the button follows the matrix.
   */
  const mayRaise = canEdit(role, 'material_request');
  /*
   * Procurement links straight into this list from its own screens
   * ("2 approved requests with no order yet", a project's cost tab), so the
   * status and project filters can arrive in the URL. They seed the state
   * once and stay editable afterwards — a filter the user cannot then clear
   * would be worse than no deep link at all.
   */
  const params = useSearchParams();
  const initialStatus = params.get('status');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<MaterialRequestStatus | 'all'>(
    MATERIAL_REQUEST_STATUSES.includes(initialStatus as MaterialRequestStatus)
      ? (initialStatus as MaterialRequestStatus)
      : 'all',
  );
  const [projectId, setProjectId] = useState(params.get('project') ?? '');
  const [requestedBy, setRequestedBy] = useState('all');
  const [pendingOnly, setPendingOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('newest');
  const [view, setView] = useState<ViewMode>('list');

  const requests = useLiveQuery(
    () =>
      materialRequestRepository.list({
        search,
        status,
        project_id: projectId || undefined,
        requested_by: requestedBy,
        pending_only: pendingOnly,
      }),
    [search, status, projectId, requestedBy, pendingOnly],
  );

  const counts = useLiveQuery(() => materialRequestRepository.countByStatus(), []);
  const total = useLiveQuery(() => materialRequestRepository.count(), []);
  const projects = useLiveQuery(() => projectRepository.list(), []);
  const siteTeam = useLiveQuery(
    () => userRepository.listByRole(['site_manager', 'project_manager']),
    [],
  );

  const pendingCount = counts?.pending ?? 0;
  const rows = useMemo(() => {
    const list = [...(requests ?? [])];
    switch (sort) {
      case 'oldest':
        return list.sort(
          (a, b) =>
            a.request_date.localeCompare(b.request_date) ||
            a.created_at.localeCompare(b.created_at),
        );
      case 'status':
        // pipeline order, so the queue reads pending → … → fulfilled
        return list.sort(
          (a, b) =>
            MATERIAL_REQUEST_STATUSES.indexOf(a.status) -
              MATERIAL_REQUEST_STATUSES.indexOf(b.status) ||
            b.request_date.localeCompare(a.request_date),
        );
      case 'project':
        return list.sort(
          (a, b) =>
            (a.project?.name ?? '').localeCompare(b.project?.name ?? '') ||
            b.request_date.localeCompare(a.request_date),
        );
      default:
        return list.sort(
          (a, b) =>
            b.request_date.localeCompare(a.request_date) ||
            b.created_at.localeCompare(a.created_at),
        );
    }
  }, [requests, sort]);
  const paged = usePagination(rows);

  const loading = requests === undefined;
  const hasAny = (total ?? 0) > 0;
  const filtersActive =
    Boolean(search || projectId) || status !== 'all' || requestedBy !== 'all' || pendingOnly;

  function resetFilters() {
    setSearch('');
    setStatus('all');
    setProjectId('');
    setRequestedBy('all');
    setPendingOnly(false);
  }

  return (
    <>
      <PageHeader
        title="Material Requests"
        subtitle="What the site has asked for — raised here, decided by Procurement, closed when the site confirms it arrived."
        action={
          mayRaise ? (
            <Link href="/admin/material-requests/new">
              <Button>
                <Plus className="size-4" /> Raise Request
              </Button>
            </Link>
          ) : undefined
        }
      />

      {pendingCount > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-hairline bg-white p-4 shadow-sm">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600">
            <ClipboardList className="size-5" />
          </span>
          <p className="mr-auto text-sm text-ink">
            <span className="font-semibold">Procurement inbox:</span>{' '}
            <span className="text-amber-600">
              {pendingCount} request{pendingCount === 1 ? '' : 's'} waiting on a decision
            </span>
          </p>
          <Button
            size="sm"
            variant={pendingOnly ? 'primary' : 'outline'}
            onClick={() => setPendingOnly(!pendingOnly)}
          >
            {pendingOnly ? 'Show all' : 'Show pending'}
          </Button>
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
                    placeholder="Code, item, project…"
                    className="pr-9"
                  />
                </div>
              </Field>

              <Field label="Status">
                <SelectInput
                  value={status}
                  onChange={(e) => setStatus(e.target.value as MaterialRequestStatus | 'all')}
                >
                  <option value="all">All statuses</option>
                  {MATERIAL_REQUEST_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {MATERIAL_REQUEST_STATUS_META[s].label}
                      {counts?.[s] ? ` (${counts[s]})` : ''}
                    </option>
                  ))}
                </SelectInput>
              </Field>

              <Field label="Project">
                <SelectInput value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  <option value="">All projects</option>
                  {(projects ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </SelectInput>
              </Field>

              <Field label="Requested by">
                <SelectInput
                  value={requestedBy}
                  onChange={(e) => setRequestedBy(e.target.value)}
                >
                  <option value="all">Everyone</option>
                  {(siteTeam ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
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
              {loading ? 'Loading…' : `Showing ${rows.length} request${rows.length === 1 ? '' : 's'}`}
            </p>
            <div className="flex items-center gap-2">
              <ViewToggle value={view} onChange={setView} />
              <SelectInput
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="w-auto max-w-[14rem]"
                aria-label="Sort requests"
              >
                {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                  <option key={key} value={key}>
                    {SORT_LABELS[key]}
                  </option>
                ))}
              </SelectInput>
            </div>
          </div>

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
              icon={Package}
              title={hasAny ? 'No request matches these filters' : 'No material request yet'}
              description={
                hasAny
                  ? 'Try clearing the status or project filter.'
                  : 'When the site runs short, raise the request here — Procurement picks it up from the same list.'
              }
              action={
                hasAny ? (
                  <Button variant="outline" onClick={resetFilters}>
                    Clear filters
                  </Button>
                ) : mayRaise ? (
                  <Link href="/admin/material-requests/new">
                    <Button>
                      <Plus className="size-4" /> Raise Request
                    </Button>
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <>
              <ResultsLayout view={view}>
                {paged.pageRows.map((request) => {
                  const meta = MATERIAL_REQUEST_STATUS_META[request.status];
                  const totals = requestTotals(request.items);
                  const headline = request.items[0]?.item_name ?? 'No items';

                  return (
                    <ResultCard
                      key={request.id}
                      href={`/admin/material-requests/${request.id}`}
                      view={view}
                      code={request.code}
                      title={headline}
                      subtitle={
                        totals.lines > 1
                          ? `and ${totals.lines - 1} more item${totals.lines === 2 ? '' : 's'}`
                          : undefined
                      }
                      status={<Badge tone={meta.tone}>{meta.label}</Badge>}
                      footer={`Requested ${formatDate(request.request_date)}`}
                      facts={
                        <>
                          {request.project && (
                            <Badge tone="teal">
                              <Building2 className="size-3.5" />
                              {request.project.name}
                              {request.tower ? ` · ${request.tower.name}` : ''}
                            </Badge>
                          )}
                          {request.work_item && (
                            <Badge tone="blue">
                              <ListChecks className="size-3.5" />
                              {request.work_item.name}
                            </Badge>
                          )}
                          <Badge>
                            <Package className="size-3.5" />
                            {totals.lines} line{totals.lines === 1 ? '' : 's'}
                          </Badge>
                          {request.requester_name && (
                            <Badge tone="neutral">
                              <UserRound className="size-3.5" />
                              {request.requester_name}
                            </Badge>
                          )}
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
                label="requests"
              />
            </>
          )}
        </section>
      </div>
    </>
  );
}

/** Deep links carry ?status= and ?project=, so Suspense is required. */
export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-ink-muted">Loading…</p>}>
      <MaterialRequestsPage />
    </Suspense>
  );
}
