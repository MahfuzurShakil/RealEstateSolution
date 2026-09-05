'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Package, Pencil, Plus, Search } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, SelectInput, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { useMockSession } from '@/lib/auth/mock-session';
import { canEdit } from '@/lib/domain/access';
import type { MaterialItem } from '@/lib/db/types';
import type { MaterialItemWithUsage } from '@/lib/repositories';
import {
  DuplicateMaterialItemError,
  lookupRepository,
  materialItemRepository,
} from '@/lib/repositories';

/**
 * The material catalogue (Tier 3.1, Section 6.6).
 *
 * Not in Master Data with the option lists, because this is a table with its
 * own columns and its own usage counts rather than a list of strings — and
 * because it belongs to Procurement, who buy the materials, rather than to the
 * Super Admin who curates dropdowns.
 */
export default function MaterialItemsPage() {
  const { role, userId } = useMockSession();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState<'active' | 'all'>('active');
  const [editing, setEditing] = useState<MaterialItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [retiring, setRetiring] = useState<MaterialItemWithUsage | null>(null);

  const items = useLiveQuery(
    () => materialItemRepository.list({ search, category, status }),
    [search, category, status],
  );
  const categories = useLiveQuery(() => materialItemRepository.categories(), []);
  const total = useLiveQuery(() => materialItemRepository.count(), []);

  const rows = useMemo(() => items ?? [], [items]);
  const mayEdit = canEdit(role, 'procurement');

  const columns: Column<MaterialItemWithUsage>[] = [
    {
      key: 'code',
      header: 'Code',
      cell: (row) => <span className="text-ink-muted">{row.code}</span>,
      sortValue: (row) => row.code,
    },
    {
      key: 'name',
      header: 'Item',
      cell: (row) => (
        <span className="font-medium text-ink">
          {row.name}
          {!row.is_active && (
            <Badge tone="neutral" className="ml-2">
              Retired
            </Badge>
          )}
        </span>
      ),
      sortValue: (row) => row.name,
    },
    {
      key: 'unit',
      header: 'Unit',
      cell: (row) => row.unit,
      sortValue: (row) => row.unit,
    },
    {
      key: 'category',
      header: 'Category',
      cell: (row) => row.category ?? <span className="text-ink-muted">—</span>,
      sortValue: (row) => row.category ?? '',
    },
    {
      /*
       * What is actually held under this item, across every store. It answers
       * the question that decides whether an item can be retired, and it is
       * the number that used to be split across several spellings.
       */
      key: 'quantity_available',
      header: 'In stock',
      align: 'right',
      cell: (row) =>
        row.stock_rows === 0 ? (
          <span className="text-ink-muted">—</span>
        ) : (
          <span className="text-sm text-ink">
            {row.quantity_available} {row.unit}
            <span className="block text-xs text-ink-muted">
              {row.stock_rows} store{row.stock_rows === 1 ? '' : 's'}
            </span>
          </span>
        ),
      sortValue: (row) => row.quantity_available,
    },
    {
      key: 'order_lines',
      header: 'Ordered',
      align: 'right',
      cell: (row) =>
        row.order_lines === 0 ? (
          <span className="text-ink-muted">never</span>
        ) : (
          `${row.order_lines} line${row.order_lines === 1 ? '' : 's'}`
        ),
      sortValue: (row) => row.order_lines,
    },
    ...(mayEdit
      ? [
          {
            key: 'actions',
            header: '',
            align: 'right' as const,
            cell: (row: MaterialItemWithUsage) => (
              <div className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Edit ${row.name}`}
                  onClick={() => setEditing(row)}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    row.is_active
                      ? setRetiring(row)
                      : materialItemRepository.setActive(row.id, true)
                  }
                >
                  {row.is_active ? 'Retire' : 'Restore'}
                </Button>
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Material Items"
        subtitle="The catalogue behind every requisition, order and stock row — so one material is one item, however it gets typed."
        action={
          mayEdit ? (
            <Button onClick={() => setAdding(true)}>
              <Plus className="size-4" /> New item
            </Button>
          ) : undefined
        }
      />

      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Search" className="xl:col-span-2">
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <TextInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, code, unit…"
                className="pr-9"
              />
            </div>
          </Field>
          <Field label="Category">
            <SelectInput value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {(categories ?? []).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Show">
            <SelectInput
              value={status}
              onChange={(e) => setStatus(e.target.value as 'active' | 'all')}
            >
              <option value="active">In use</option>
              <option value="all">Including retired</option>
            </SelectInput>
          </Field>
        </div>

        <DataTable
          rows={rows}
          columns={columns}
          label="items"
          emptyState={
            <EmptyState
              icon={Package}
              title={(total ?? 0) > 0 ? 'No item matches these filters' : 'The catalogue is empty'}
              description={
                (total ?? 0) > 0
                  ? 'Try a different search, or include retired items.'
                  : 'Items are added here, or from the "+" beside the item picker on a requisition or a purchase order. Reloading the sample data builds a catalogue from the demo procurement records.'
              }
            />
          }
          mobileCard={(row) => (
            <div className="space-y-1">
              <p className="font-medium text-ink">
                {row.name} <span className="text-ink-muted">({row.unit})</span>
              </p>
              <p className="text-xs text-ink-muted">
                {row.code}
                {row.category ? ` · ${row.category}` : ''}
                {row.stock_rows > 0
                  ? ` · ${row.quantity_available} ${row.unit} in stock`
                  : ' · no stock'}
              </p>
            </div>
          )}
        />
      </Card>

      {(adding || editing) && (
        <ItemModal
          item={editing}
          userId={userId}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      )}

      <ConfirmDialog
        open={retiring !== null}
        title={`Retire “${retiring?.name ?? ''}”`}
        tone="warning"
        confirmLabel="Retire item"
        message={
          retiring && retiring.quantity_available > 0
            ? `This item still holds ${retiring.quantity_available} ${retiring.unit} in stock. Retiring hides it from the pickers; the stock stays where it is and can still be issued.`
            : 'It stops appearing in the pickers. Everything already recorded against it keeps reading correctly — which is why an item is retired rather than deleted.'
        }
        onCancel={() => setRetiring(null)}
        onConfirm={async () => {
          if (retiring) await materialItemRepository.setActive(retiring.id, false);
          setRetiring(null);
        }}
      />
    </>
  );
}

function ItemModal({
  item,
  userId,
  onClose,
}: {
  item: MaterialItem | null;
  userId: string | null;
  onClose: () => void;
}) {
  const units = useLiveQuery(() => lookupRepository.options('material_unit', null), []);
  const unitLocked = useLiveQuery(
    () => (item ? materialItemRepository.canChangeUnit(item.id) : Promise.resolve(true)),
    [item?.id],
  );

  const [name, setName] = useState(item?.name ?? '');
  const [unit, setUnit] = useState(item?.unit ?? '');
  const [category, setCategory] = useState(item?.category ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const resolvedUnit = unit || units?.[0]?.value || '';
  const mayChangeUnit = unitLocked !== false;

  return (
    <Modal
      open
      onClose={onClose}
      title={item ? 'Edit item' : 'New material item'}
      subtitle={item?.code}
      icon={Package}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            disabled={saving || !name.trim()}
            onClick={async () => {
              setSaving(true);
              setError(null);
              try {
                if (item) {
                  await materialItemRepository.updateItem(
                    item.id,
                    {
                      name,
                      category: category.trim() || null,
                      ...(mayChangeUnit ? { unit: resolvedUnit } : {}),
                    },
                    userId,
                  );
                } else {
                  await materialItemRepository.createItem(
                    { name, unit: resolvedUnit, category },
                    userId,
                  );
                }
                onClose();
              } catch (e) {
                setError(
                  e instanceof DuplicateMaterialItemError
                    ? e.message
                    : e instanceof Error
                      ? e.message
                      : 'Could not save the item.',
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? 'Saving…' : item ? 'Save changes' : 'Add item'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field
          label="Name"
          required
          error={error ?? undefined}
          hint={
            item
              ? 'Renaming changes it everywhere at once. Stock and cost do not move — the item, not its name, is what they are keyed to.'
              : undefined
          }
        >
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Cement (Shah Special)"
            invalid={Boolean(error)}
          />
        </Field>

        <Field
          label="Stocked in"
          required
          hint={
            mayChangeUnit
              ? 'One unit per item — buying in another unit is a conversion, not a second item'
              : 'Locked: this item holds stock, and average cost is per unit, so changing it would revalue the store'
          }
        >
          <SelectInput
            value={resolvedUnit}
            disabled={!mayChangeUnit}
            onChange={(e) => setUnit(e.target.value)}
          >
            {(units ?? []).map((u) => (
              <option key={u.id} value={u.value}>
                {u.value}
              </option>
            ))}
          </SelectInput>
        </Field>

        <Field label="Category" hint="Free grouping — cement, rod, sand, electrical…">
          <TextInput
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Optional"
          />
        </Field>
      </div>
    </Modal>
  );
}
