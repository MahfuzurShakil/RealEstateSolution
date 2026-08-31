'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import { LandownerQuickAddModal } from '@/components/admin/lands/LandownerQuickAddModal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { TextInput } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import type { Landowner } from '@/lib/db/types';
import { landownerRepository } from '@/lib/repositories';
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

  const rows = (owners ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));

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
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <TextInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone or NID"
            className="pr-9"
          />
        </div>
      </Card>

      {owners === undefined ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : rows.length === 0 ? (
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
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-hairline text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Phone</th>
                <th className="px-5 py-3 font-medium">NID</th>
                <th className="px-5 py-3 font-medium">Address</th>
                <th className="px-5 py-3 font-medium">Lands</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((owner) => (
                <tr key={owner.id} className="border-b border-hairline last:border-0">
                  <td className="px-5 py-3 font-medium text-ink">{owner.name}</td>
                  <td className="px-5 py-3 text-ink-muted">{owner.phone || '—'}</td>
                  <td className="px-5 py-3 text-ink-muted">{owner.nid || '—'}</td>
                  <td className="max-w-xs truncate px-5 py-3 text-ink-muted">
                    {owner.address || '—'}
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={usage?.[owner.id] ? 'teal' : 'neutral'}>
                      {usage?.[owner.id] ?? 0}
                    </Badge>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Edit landowner"
                        onClick={() => {
                          setEditing(owner);
                          setModalOpen(true);
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Delete landowner"
                        onClick={() => requestDelete(owner)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
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
