'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { MapPin, Plus, Ruler, Search, Wallet } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, SelectInput, TextInput } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination, usePagination } from '@/components/ui/Pagination';
import { ResultCard } from '@/components/ui/ResultCard';
import { ResultsLayout, ViewToggle, type ViewMode } from '@/components/ui/ViewToggle';
import { ACQUISITION_TYPES, LAND_STATUSES, type AcquisitionType, type LandStatus } from '@/lib/db/types';
import {
  ACQUISITION_TYPE_LABEL,
  LAND_SIZE_UNIT_LABEL,
  LAND_STATUS_META,
  landHeadlineAmount,
} from '@/lib/domain/land';
import { landRepository } from '@/lib/repositories';
import { formatBdt, formatDate } from '@/lib/utils/format';

type SortKey = 'newest' | 'oldest' | 'price_high' | 'price_low' | 'size_high';

/** Land list — Design Reference A.7 (filter sidebar + result cards, grid/list toggle). */
export default function LandsListPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<LandStatus | 'all'>('all');
  const [acquisitionType, setAcquisitionType] = useState<AcquisitionType | 'all'>('all');
  const [district, setDistrict] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [view, setView] = useState<ViewMode>('list');

  const lands = useLiveQuery(
    () => landRepository.list({ search, status, acquisition_type: acquisitionType, district }),
    [search, status, acquisitionType, district],
  );

  const allLands = useLiveQuery(() => landRepository.getAll(), []);
  const districts = useMemo(
    () => [...new Set((allLands ?? []).map((l) => l.location_district).filter(Boolean))].sort(),
    [allLands],
  );

  const rows = useMemo(() => {
    const list = [...(lands ?? [])];
    switch (sort) {
      case 'oldest':
        return list.sort((a, b) => a.created_at.localeCompare(b.created_at));
      case 'price_high':
        return list.sort((a, b) => b.asking_price - a.asking_price);
      case 'price_low':
        return list.sort((a, b) => a.asking_price - b.asking_price);
      case 'size_high':
        return list.sort((a, b) => b.land_size - a.land_size);
      default:
        return list.sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
  }, [lands, sort]);

  const paged = usePagination(rows);

  const loading = lands === undefined;
  const hasAnyLand = (allLands?.length ?? 0) > 0;
  const filtersActive =
    Boolean(search) || status !== 'all' || acquisitionType !== 'all' || Boolean(district);

  function resetFilters() {
    setSearch('');
    setStatus('all');
    setAcquisitionType('all');
    setDistrict('');
  }

  return (
    <>
      <PageHeader
        title="Lands"
        subtitle="Land opportunities from first contact through acquisition or JV."
        action={
          <Link href="/admin/lands/new">
            <Button>
              <Plus className="size-4" /> Add Land
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
                    placeholder="Code, name, area, dag…"
                    className="pr-9"
                  />
                </div>
              </Field>

              <Field label="Status">
                <SelectInput
                  value={status}
                  onChange={(e) => setStatus(e.target.value as LandStatus | 'all')}
                >
                  <option value="all">All statuses</option>
                  {LAND_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {LAND_STATUS_META[s].label}
                    </option>
                  ))}
                </SelectInput>
              </Field>

              <Field label="Acquisition Type">
                <SelectInput
                  value={acquisitionType}
                  onChange={(e) => setAcquisitionType(e.target.value as AcquisitionType | 'all')}
                >
                  <option value="all">All types</option>
                  {ACQUISITION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {ACQUISITION_TYPE_LABEL[t]}
                    </option>
                  ))}
                </SelectInput>
              </Field>

              <Field label="District">
                <SelectInput value={district} onChange={(e) => setDistrict(e.target.value)}>
                  <option value="">All districts</option>
                  {districts.map((d) => (
                    <option key={d} value={d}>
                      {d}
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
              {loading ? 'Loading…' : `Showing ${rows.length} land${rows.length === 1 ? '' : 's'}`}
            </p>
            <div className="flex items-center gap-2">
              <ViewToggle value={view} onChange={setView} />
              <SelectInput
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="w-auto max-w-[10rem]"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="price_high">Price: high to low</option>
                <option value="price_low">Price: low to high</option>
                <option value="size_high">Largest size</option>
              </SelectInput>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-28 animate-pulse rounded-2xl border border-hairline bg-white" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={MapPin}
              title={hasAnyLand ? 'No land matches these filters' : 'No land recorded yet'}
              description={
                hasAnyLand
                  ? 'Try clearing a filter or searching for a different code or area.'
                  : 'Add the first land opportunity to start tracking it through the pipeline.'
              }
              action={
                hasAnyLand ? (
                  <Button variant="outline" onClick={resetFilters}>
                    Clear filters
                  </Button>
                ) : (
                  <Link href="/admin/lands/new">
                    <Button>
                      <Plus className="size-4" /> Add Land
                    </Button>
                  </Link>
                )
              }
            />
          ) : (
            <>
              <ResultsLayout view={view}>
                {paged.pageRows.map((land) => {
                  const meta = LAND_STATUS_META[land.status];
                  return (
                    <ResultCard
                      key={land.id}
                      href={`/admin/lands/${land.id}`}
                      view={view}
                      code={land.code}
                      title={land.name}
                      status={<Badge tone={meta.tone}>{meta.label}</Badge>}
                      footer={`Added ${formatDate(land.created_at)}`}
                      facts={
                        <>
                          <Badge>
                            <MapPin className="size-3.5" />
                            {[land.location_area, land.location_district]
                              .filter(Boolean)
                              .join(', ')}
                          </Badge>
                          <Badge>
                            <Ruler className="size-3.5" />
                            {land.land_size} {LAND_SIZE_UNIT_LABEL[land.land_size_unit]}
                          </Badge>
                          <Badge>
                            <Wallet className="size-3.5" />
                            {formatBdt(landHeadlineAmount(land).amount)}
                          </Badge>
                          <Badge
                            tone={land.acquisition_type === 'joint_venture' ? 'teal' : 'neutral'}
                          >
                            {ACQUISITION_TYPE_LABEL[land.acquisition_type]}
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
                label="lands"
              />
            </>
          )}
        </section>
      </div>
    </>
  );
}
