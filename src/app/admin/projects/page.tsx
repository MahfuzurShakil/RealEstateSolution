'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Building2,
  CalendarDays,
  Globe,
  MapPin,
  Plus,
  Search,
  Star,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Checkbox, Field, SelectInput, TextInput } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination, usePagination } from '@/components/ui/Pagination';
import { ResultCard } from '@/components/ui/ResultCard';
import { ResultsLayout, ViewToggle, type ViewMode } from '@/components/ui/ViewToggle';
import { PROJECT_STATUSES, PROJECT_TYPES, type ProjectStatus, type ProjectType } from '@/lib/db/types';
import { PROJECT_STATUS_META, PROJECT_TYPE_LABEL } from '@/lib/domain/project';
import { projectRepository, unitRepository } from '@/lib/repositories';
import { formatDate } from '@/lib/utils/format';

type SortKey = 'newest' | 'oldest' | 'completion_soon' | 'name';

/** Project list — Design Reference A.7 (filter sidebar + result cards). */
export default function ProjectsListPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ProjectStatus | 'all'>('all');
  const [projectType, setProjectType] = useState<ProjectType | 'all'>('all');
  const [publicOnly, setPublicOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('newest');
  const [view, setView] = useState<ViewMode>('list');

  const projects = useLiveQuery(
    () =>
      projectRepository.list({
        search,
        status,
        project_type: projectType,
        ...(publicOnly ? { is_public: true } : {}),
      }),
    [search, status, projectType, publicOnly],
  );

  const allProjects = useLiveQuery(() => projectRepository.getAll(), []);

  /** Unit roll-up per project, so a card can show "48 units · 12 sold". */
  const unitStats = useLiveQuery(async () => {
    const stats = new Map<string, { total: number; available: number }>();
    for (const project of (await projectRepository.getAll()) ?? []) {
      const units = await unitRepository.listForProject(project.id);
      stats.set(project.id, {
        total: units.length,
        available: units.filter((u) => u.status === 'available').length,
      });
    }
    return stats;
  }, []);

  const rows = useMemo(() => {
    const list = [...(projects ?? [])];
    switch (sort) {
      case 'oldest':
        return list.sort((a, b) => a.created_at.localeCompare(b.created_at));
      case 'completion_soon':
        return list.sort((a, b) =>
          a.expected_completion_date.localeCompare(b.expected_completion_date),
        );
      case 'name':
        return list.sort((a, b) => a.name.localeCompare(b.name));
      default:
        return list.sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
  }, [projects, sort]);

  const paged = usePagination(rows);

  const loading = projects === undefined;
  const hasAny = (allProjects?.length ?? 0) > 0;
  const filtersActive = Boolean(search) || status !== 'all' || projectType !== 'all' || publicOnly;

  function resetFilters() {
    setSearch('');
    setStatus('all');
    setProjectType('all');
    setPublicOnly(false);
  }

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="Developments built on acquired or JV-signed land, with their towers and units."
        action={
          <Link href="/admin/projects/new">
            <Button>
              <Plus className="size-4" /> Add Project
            </Button>
          </Link>
        }
      />

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
                    placeholder="Code, name, location…"
                    className="pr-9"
                  />
                </div>
              </Field>

              <Field label="Status">
                <SelectInput
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ProjectStatus | 'all')}
                >
                  <option value="all">All statuses</option>
                  {PROJECT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {PROJECT_STATUS_META[s].label}
                    </option>
                  ))}
                </SelectInput>
              </Field>

              <Field label="Project Type">
                <SelectInput
                  value={projectType}
                  onChange={(e) => setProjectType(e.target.value as ProjectType | 'all')}
                >
                  <option value="all">All types</option>
                  {PROJECT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {PROJECT_TYPE_LABEL[t]}
                    </option>
                  ))}
                </SelectInput>
              </Field>

              <Checkbox
                label="Public website only"
                checked={publicOnly}
                onChange={(e) => setPublicOnly(e.target.checked)}
              />

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
              {loading
                ? 'Loading…'
                : `Showing ${rows.length} project${rows.length === 1 ? '' : 's'}`}
            </p>
            <div className="flex items-center gap-2">
              <ViewToggle value={view} onChange={setView} />
              <SelectInput
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="w-auto max-w-[12rem]"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="completion_soon">Completing soonest</option>
                <option value="name">Name A–Z</option>
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
              icon={Building2}
              title={hasAny ? 'No project matches these filters' : 'No project yet'}
              description={
                hasAny
                  ? 'Try clearing a filter or searching for a different code.'
                  : 'Create a project against an acquired or JV-signed land to start adding towers and units.'
              }
              action={
                hasAny ? (
                  <Button variant="outline" onClick={resetFilters}>
                    Clear filters
                  </Button>
                ) : (
                  <Link href="/admin/projects/new">
                    <Button>
                      <Plus className="size-4" /> Add Project
                    </Button>
                  </Link>
                )
              }
            />
          ) : (
            <>
              <ResultsLayout view={view}>
                {paged.pageRows.map((project) => {
                  const meta = PROJECT_STATUS_META[project.status];
                  const stats = unitStats?.get(project.id);
                  return (
                    <ResultCard
                      key={project.id}
                      href={`/admin/projects/${project.id}`}
                      view={view}
                      code={project.code}
                      title={project.name}
                      status={
                        <>
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                          {project.is_featured && (
                            <Badge tone="amber">
                              <Star className="size-3.5" /> Featured
                            </Badge>
                          )}
                        </>
                      }
                      footer={`Added ${formatDate(project.created_at)}`}
                      facts={
                        <>
                          {project.location_summary && (
                            <Badge>
                              <MapPin className="size-3.5" />
                              {project.location_summary}
                            </Badge>
                          )}
                          <Badge>{PROJECT_TYPE_LABEL[project.project_type]}</Badge>
                          <Badge>
                            <CalendarDays className="size-3.5" />
                            Completion {formatDate(project.expected_completion_date)}
                          </Badge>
                          {stats && stats.total > 0 && (
                            <Badge tone="teal">
                              {stats.total} units · {stats.available} available
                            </Badge>
                          )}
                          {project.is_public && (
                            <Badge tone="green">
                              <Globe className="size-3.5" /> Public
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
                label="projects"
              />
            </>
          )}
        </section>
      </div>
    </>
  );
}
