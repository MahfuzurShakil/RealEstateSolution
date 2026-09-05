'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Pencil, Plus, Trash2, User, Users } from 'lucide-react';
import { LandownerQuickAddModal } from '@/components/admin/lands/LandownerQuickAddModal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterBar } from '@/components/ui/FilterBar';
import { PageHeader } from '@/components/ui/PageHeader';
import type { Landowner } from '@/lib/db/types';
import { landownerRepository } from '@/lib/repositories';
import { formatPhone } from '@/lib/utils/format';
import { db } from '@/lib/db/database';

/** Landowner master list (Section 2.4) — reusable across lands. */
export default function LandownersPage() {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Landowner | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Landowner | null>(null);
  const [deleteBlocked, setDeleteBlocked] = useState<string | null>(null);

  const owners = useLiveQuery(() => landownerRepository.search(search), [search]);

  // land count per owner, so the list shows where each owner is used
  const usage = useLiveQuery(async () => {
    const rows = await db.land_owner_mapping.toArray();
    return rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.owner_id] = (acc[r.owner_id] ?? 0) + 1;
      return acc;
    }, {});
  }, []);

  async function requestDelete(owner: Landowner) {
    const lands = await landownerRepository.landsFor(owner.id);
    if (lands.length > 0) {
      setDeleteBlocked(
        `${owner.name} is linked to ${lands.length} land${lands.length === 1 ? '' : 's'} (${lands
          .map((l) => l.code)
          .join(', ')}). Remove those links first.`,
      );
      return;
    }
    setDeleteTarget(owner);
  }

  const rows = owners ?? [];

  /*
   * The owner list only grows, so it is a paginated, sortable table rather than
   * every row on one page (Design Reference A.7 / the UrbanHub datatable).
   */
  const columns: Column<Landowner>[] = [
    {
      key: 'name',
      header: 'Name',
      sortValue: (owner) => owner.name,
      cell: (owner) => (
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-admin-50 text-admin-600">
            <User className="size-4" />
          </span>
          <span className="font-medium text-ink">{owner.name}</span>
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
            className="text-admin-700 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {formatPhone(owner.phone)}
          </a>
        ) : (
          <span className="text-ink-muted">—</span>
        ),
    },
    {
      key: 'nid',
      header: 'NID',
      sortValue: (owner) => owner.nid ?? '',
      cell: (owner) => <span className="text-ink-muted">{owner.nid || '—'}</span>,
    },
    {
      key: 'address',
      header: 'Address',
      className: 'max-w-xs',
      cell: (owner) => (
        <span className="block truncate text-ink-muted">{owner.address || '—'}</span>
      ),
      // blank addresses sort last rather than first, so the column opens on
      // the rows that actually have one
      sortValue: (owner) => owner.address || 'zzz',
    },
    {
      key: 'lands',
      header: 'Lands',
      align: 'right',
      sortValue: (owner) => usage?.[owner.id] ?? 0,
      cell: (owner) => (
        <Badge tone={usage?.[owner.id] ? 'teal' : 'neutral'}>{usage?.[owner.id] ?? 0}</Badge>
      ),
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

  return (
    <>
      <PageHeader
        title="Landowners"
        subtitle="Master list — one owner can be linked to several lands."
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            <Plus className="size-4" /> Add Landowner
          </Button>
        }
      />

      <Card className="mb-5">
        <FilterBar
          className="mb-0"
          search={{ value: search, onChange: setSearch, placeholder: 'Name, phone or NID' }}
          isFiltered={Boolean(search)}
          onReset={() => setSearch('')}
          resultLabel={
            owners === undefined
              ? 'Loading…'
              : `${owners.length} landowner${owners.length === 1 ? '' : 's'}`
          }
        />
      </Card>

      {owners === undefined ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : (
        <DataTable
          rows={rows}
          columns={columns}
          initialSort={{ key: 'name' }}
          onRowClick={(owner) => {
            setEditing(owner);
            setModalOpen(true);
          }}
          emptyState={
            <EmptyState
              icon={Users}
              title={search ? 'No landowner matches that search' : 'No landowner recorded yet'}
              description={
                search
                  ? 'Try a different name, phone number or NID.'
                  : 'Owners added here can be linked to any land.'
              }
              action={
                !search ? (
                  <Button
                    onClick={() => {
                      setEditing(null);
                      setModalOpen(true);
                    }}
                  >
                    <Plus className="size-4" /> Add Landowner
                  </Button>
                ) : undefined
              }
            />
          }
        />
      )}

      <p className="mt-4 text-sm text-ink-muted">
        Link owners to a land from the{' '}
        <Link href="/admin/lands" className="text-admin-700 underline">
          Lands
        </Link>{' '}
        page.
      </p>

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

      <ConfirmDialog
        open={deleteBlocked !== null}
        title="Cannot delete landowner"
        message={deleteBlocked ?? ''}
        confirmLabel="OK"
        onCancel={() => setDeleteBlocked(null)}
        onConfirm={() => setDeleteBlocked(null)}
      />
    </>
  );
}
