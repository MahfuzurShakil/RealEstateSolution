'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertCircle, Link2, Link2Off, Pencil, Plus, Trash2, User, Users } from 'lucide-react';
import { LandownerQuickAddModal } from '@/components/admin/lands/LandownerQuickAddModal';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ResultDialog } from '@/components/ui/ResultDialog';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterBar, FilterField } from '@/components/ui/FilterBar';
import { SelectInput } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import type { Landowner } from '@/lib/db/types';
import { landRepository, landownerRepository } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatPhone } from '@/lib/utils/format';

type View = 'all' | 'linked' | 'unlinked' | 'incomplete';

/** An owner the office cannot reach or identify — no phone, or no NID. */
const incomplete = (o: Landowner) => !o.phone || !o.nid;

/**
 * Landowner master list (Section 2.4) — reusable across lands.
 *
 * 2026-10-22 — four summary tiles that are also the main filter (all,
 * linked, not linked yet, missing phone or NID), a land filter beside the
 * search so the filter row is not one box and empty space, the lands an
 * owner is on shown by code, and five rows to a page.
 */
export default function LandownersPage() {
  const [search, setSearch] = useState('');
  const [view, setView] = useState<View>('all');
  const [landId, setLandId] = useState('');
  const [editing, setEditing] = useState<Landowner | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Landowner | null>(null);
  const [deleteBlocked, setDeleteBlocked] = useState<string | null>(null);

  const owners = useLiveQuery(() => landownerRepository.search(search), [search]);
  const landsOf = useLiveQuery(() => landownerRepository.landsByOwner(), []);
  const lands = useLiveQuery(() => landRepository.getAll(), []);

  /* the tiles count the search result, so they answer "of these, how many…" */
  const counts = useMemo(() => {
    const list = owners ?? [];
    const linked = list.filter((o) => (landsOf?.get(o.id)?.length ?? 0) > 0).length;
    return {
      all: list.length,
      linked,
      unlinked: list.length - linked,
      incomplete: list.filter(incomplete).length,
    };
  }, [owners, landsOf]);

  const rows = useMemo(() => {
    let list = owners ?? [];
    if (view === 'linked') list = list.filter((o) => (landsOf?.get(o.id)?.length ?? 0) > 0);
    if (view === 'unlinked') list = list.filter((o) => !(landsOf?.get(o.id)?.length ?? 0));
    if (view === 'incomplete') list = list.filter(incomplete);
    if (landId) list = list.filter((o) => landsOf?.get(o.id)?.some((l) => l.id === landId));
    return list;
  }, [owners, landsOf, view, landId]);

  async function requestDelete(owner: Landowner) {
    const linked = await landownerRepository.landsFor(owner.id);
    if (linked.length > 0) {
      setDeleteBlocked(
        `${owner.name} is linked to ${linked.length} land${linked.length === 1 ? '' : 's'} (${linked
          .map((l) => l.code)
          .join(', ')}). Remove those links first.`,
      );
      return;
    }
    setDeleteTarget(owner);
  }

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const filtered = Boolean(search) || view !== 'all' || Boolean(landId);

  const columns: Column<Landowner>[] = [
    {
      key: 'name',
      header: 'Owner',
      sortValue: (owner) => owner.name,
      cell: (owner) => (
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-admin-50 text-admin-600">
            <User className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="font-medium text-ink">{owner.name}</p>
            <p className={cn('text-xs', owner.nid ? 'text-ink-muted' : 'text-amber-700')}>
              {owner.nid ? `NID ${owner.nid}` : 'No NID'}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'phone',
      header: 'Phone',
      sortValue: (owner) => owner.phone ?? '',
      cell: (owner) =>
        owner.phone ? (
          <a
            href={`tel:${owner.phone}`}
            className="whitespace-nowrap text-admin-700 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {formatPhone(owner.phone)}
          </a>
        ) : (
          <span className="text-xs text-amber-700">No phone</span>
        ),
    },
    {
      key: 'address',
      header: 'Address',
      className: 'max-w-[220px]',
      cell: (owner) => <span className="block truncate text-ink-muted">{owner.address || '—'}</span>,
      // blank addresses sort last rather than first
      sortValue: (owner) => owner.address || 'zzz',
    },
    {
      key: 'lands',
      header: 'Lands',
      sortValue: (owner) => landsOf?.get(owner.id)?.length ?? 0,
      cell: (owner) => {
        const owned = landsOf?.get(owner.id) ?? [];
        if (!owned.length) return <span className="text-xs text-ink-muted">Not linked yet</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {owned.map((l) => (
              <Link
                key={l.id}
                href={`/admin/lands/${l.id}`}
                title={l.name}
                onClick={(e) => e.stopPropagation()}
                className="rounded-md border border-admin-100 bg-admin-50 px-1.5 py-0.5 text-[11px] font-medium text-admin-700 hover:border-admin-300"
              >
                {l.code}
              </Link>
            ))}
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (owner) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Edit ${owner.name}`}
            onClick={(e) => {
              e.stopPropagation();
              setEditing(owner);
              setModalOpen(true);
            }}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Delete ${owner.name}`}
            onClick={(e) => {
              e.stopPropagation();
              requestDelete(owner);
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ),
    },
  ];

  const tiles: Array<{ key: View; label: string; hint: string; icon: typeof Users; tone: string }> = [
    { key: 'all', label: 'All owners', hint: 'in the master list', icon: Users, tone: 'bg-admin-50 text-admin-600' },
    { key: 'linked', label: 'Linked to a land', hint: 'on at least one plot', icon: Link2, tone: 'bg-emerald-50 text-emerald-600' },
    { key: 'unlinked', label: 'Not linked yet', hint: 'added, but on no land', icon: Link2Off, tone: 'bg-slate-100 text-slate-500' },
    { key: 'incomplete', label: 'Missing details', hint: 'no phone or no NID', icon: AlertCircle, tone: 'bg-amber-50 text-amber-600' },
  ];

  return (
    <>
      <PageHeader
        title="Landowners"
        subtitle="Master list — one owner can be linked to several lands."
        action={
          <Button onClick={openNew}>
            <Plus className="size-4" /> Add Landowner
          </Button>
        }
      />

      {/* the summary is also the main filter — click a tile to see those owners */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => {
          const Icon = t.icon;
          const active = view === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setView(active && t.key !== 'all' ? 'all' : t.key)}
              aria-pressed={active}
              className={cn(
                'flex items-center gap-3 rounded-2xl border bg-white p-4 text-left transition-colors',
                active ? 'border-admin-400 ring-2 ring-admin-100' : 'border-hairline hover:border-admin-200',
              )}
            >
              <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', t.tone)}>
                <Icon className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-xl font-semibold tabular-nums text-ink">
                  {owners === undefined ? '—' : counts[t.key]}
                </span>
                <span className="block truncate text-sm font-medium text-ink">{t.label}</span>
                <span className="block truncate text-xs text-ink-muted">{t.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      <Card className="mb-5">
        <FilterBar
          className="mb-0"
          search={{ value: search, onChange: setSearch, placeholder: 'Name, phone or NID' }}
          isFiltered={filtered}
          onReset={() => {
            setSearch('');
            setView('all');
            setLandId('');
          }}
          resultLabel={
            owners === undefined ? 'Loading…' : `${rows.length} of ${counts.all} landowner${counts.all === 1 ? '' : 's'}`
          }
        >
          <FilterField label="Land" className="w-full sm:w-64">
            <SelectInput value={landId} onChange={(e) => setLandId(e.target.value)}>
              <option value="">Any land</option>
              {(lands ?? [])
                .slice()
                .sort((a, b) => a.code.localeCompare(b.code))
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.code} · {l.name}
                  </option>
                ))}
            </SelectInput>
          </FilterField>
        </FilterBar>
      </Card>

      {owners === undefined ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : (
        <DataTable
          rows={rows}
          columns={columns}
          initialSort={{ key: 'name' }}
          pageSize={5}
          label="landowners"
          onRowClick={(owner) => {
            setEditing(owner);
            setModalOpen(true);
          }}
          emptyState={
            <EmptyState
              icon={Users}
              title={filtered ? 'No landowner matches these filters' : 'No landowner recorded yet'}
              description={
                filtered
                  ? 'Try a different name, phone number or NID, or clear the filters.'
                  : 'Owners added here can be linked to any land.'
              }
              action={
                !filtered ? (
                  <Button onClick={openNew}>
                    <Plus className="size-4" /> Add Landowner
                  </Button>
                ) : undefined
              }
            />
          }
        />
      )}

      <LandownerQuickAddModal
        open={modalOpen}
        owner={editing ?? undefined}
        onClose={() => setModalOpen(false)}
        onCreated={() => {
          setModalOpen(false);
          setEditing(null);
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete landowner"
        message={`Delete ${deleteTarget?.name}? This cannot be undone.`}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) await landownerRepository.remove(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />

      <ResultDialog
        open={deleteBlocked !== null}
        tone="warning"
        title="This landowner cannot be deleted"
        message={deleteBlocked ?? ''}
        actionLabel="OK"
        onClose={() => setDeleteBlocked(null)}
      />
    </>
  );
}
