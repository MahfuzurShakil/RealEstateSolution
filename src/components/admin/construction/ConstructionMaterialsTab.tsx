'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowDownToLine,
  ClipboardList,
  Hammer,
  Hand,
  MoreHorizontal,
  PackageCheck,
  PackageX,
  Truck,
  Undo2,
  Warehouse,
} from 'lucide-react';
import { SiteMaterialActionModal } from '@/components/admin/construction/SiteMaterialActionModal';
import { SiteReceiveModal } from '@/components/admin/construction/SiteReceiveModal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { SubTabs } from '@/components/ui/SubTabs';
import { useMockSession } from '@/lib/auth/mock-session';
import { canEdit } from '@/lib/domain/access';
import { SITE_AGEING_DAYS } from '@/lib/domain/procurement';
import { MATERIAL_REQUEST_STATUS_META, isRequestClosed } from '@/lib/domain/site-progress';
import type {
  IncomingDelivery,
  MaterialRequestWithRelations,
  SiteMaterialMode,
  SiteMaterialRow,
} from '@/lib/repositories';
import {
  materialRequestRepository,
  receivedAtSiteForRequest,
  siteMaterialsRepository,
} from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatDate } from '@/lib/utils/format';

type Sub = 'requests' | 'incoming' | 'materials';
type Chip = 'all' | 'in_store' | 'in_use' | 'used' | 'sent_back';

const n = (v: number) => Math.round(v * 1000) / 1000;

/**
 * The Construction workspace's Materials tab (PLATFORM-REPLAN §4.3, client
 * feedback 2026-10-11).
 *
 * Quantities and statuses only — money is per project in Finance. Three parts:
 * the site's requests and how far each has got; what is coming to the site and
 * has to be received (ordered for a request, or sent ahead without one); and
 * the site's materials, one row per item, where received / in use / used are
 * statuses of the same row rather than separate tabs.
 */
export function ConstructionMaterialsTab({ projectId }: { projectId: string }) {
  const { role } = useMockSession();
  const mayAct = canEdit(role, 'site_progress');
  const [sub, setSub] = useState<Sub>('materials');
  const [chip, setChip] = useState<Chip>('all');
  const [receiving, setReceiving] = useState<IncomingDelivery | null>(null);
  const [acting, setActing] = useState<{ row: SiteMaterialRow; mode: SiteMaterialMode } | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [openOnly, setOpenOnly] = useState(true);

  const requests = useLiveQuery(async () => {
    const rows = await materialRequestRepository.list({ project_id: projectId });
    return Promise.all(
      rows.map(async (r) => {
        const got = await receivedAtSiteForRequest(r.id);
        const live = r.items.filter((i) => (i.quantity_approved ?? i.quantity_requested) > 0);
        const done = live.filter(
          (i) => (got.get(i.id) ?? 0) >= (i.quantity_approved ?? i.quantity_requested) - 0.0005,
        ).length;
        return { ...r, lines_done: done, lines_live: live.length };
      }),
    );
  }, [projectId]);
  const incoming = useLiveQuery(() => siteMaterialsRepository.incoming(projectId), [projectId]);
  const materials = useLiveQuery(() => siteMaterialsRepository.forProject(projectId), [projectId]);

  const shownRequests = (requests ?? []).filter((r) => !openOnly || !isRequestClosed(r.status));
  const shownMaterials = (materials ?? []).filter((r) =>
    chip === 'all'
      ? true
      : chip === 'in_store'
        ? r.in_store > 0.0005
        : chip === 'in_use'
          ? r.in_use > 0.0005
          : chip === 'used'
            ? r.used > 0.0005
            : r.sent_back + r.sending > 0.0005,
  );
  const count = (pick: (r: SiteMaterialRow) => number) =>
    (materials ?? []).filter((r) => pick(r) > 0.0005).length;

  type RequestRow = MaterialRequestWithRelations & { lines_done: number; lines_live: number };
  const requestColumns: Column<RequestRow>[] = [
    {
      key: 'code',
      header: 'Request',
      cell: (row) => (
        <Link href={`/admin/material-requests/${row.id}`} className="font-medium text-ink hover:text-admin-700">
          {row.code}
          <span className="block text-xs font-normal text-ink-muted">
            {row.items
              .slice(0, 3)
              .map((i) => `${i.item_name} ${i.quantity_approved ?? i.quantity_requested} ${i.unit}`)
              .join(', ')}
            {row.items.length > 3 ? ` +${row.items.length - 3}` : ''}
          </span>
        </Link>
      ),
      sortValue: (row) => row.code,
    },
    {
      key: 'request_date',
      header: 'Raised',
      cell: (row) => formatDate(row.request_date),
      sortValue: (row) => row.request_date,
    },
    {
      key: 'approved',
      header: 'Approved',
      cell: (row) => {
        if (row.status === 'pending') return <span className="text-xs text-ink-muted">Waiting for the PM</span>;
        const cut = row.items.filter(
          (i) => i.quantity_approved != null && i.quantity_approved < i.quantity_requested,
        ).length;
        return cut > 0 ? (
          <span className="text-xs text-amber-700">{cut} line{cut === 1 ? '' : 's'} cut</span>
        ) : row.status === 'rejected' || row.status === 'cancelled' ? (
          <span className="text-xs text-ink-muted">—</span>
        ) : (
          <span className="text-xs text-ink-muted">In full</span>
        );
      },
    },
    {
      key: 'received',
      header: 'Received',
      cell: (row) =>
        row.lines_live > 0 && !['pending', 'rejected', 'cancelled'].includes(row.status) ? (
          <span className="text-xs text-ink">
            {row.lines_done} of {row.lines_live} line{row.lines_live === 1 ? '' : 's'}
          </span>
        ) : (
          <span className="text-xs text-ink-muted">—</span>
        ),
      sortValue: (row) => row.lines_done,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => (
        <Badge tone={MATERIAL_REQUEST_STATUS_META[row.status].tone}>
          {MATERIAL_REQUEST_STATUS_META[row.status].label}
        </Badge>
      ),
      sortValue: (row) => row.status,
    },
  ];

  const incomingColumns: Column<IncomingDelivery>[] = [
    {
      key: 'code',
      header: 'Delivery',
      cell: (row) => (
        <div>
          <span className="font-medium text-ink">{row.code}</span>
          <span className="block text-xs text-ink-muted">
            {row.kind === 'order' ? `Supplier: ${row.from_label}` : `Sent from ${row.from_label}`}
          </span>
        </div>
      ),
      sortValue: (row) => row.code,
    },
    {
      key: 'what',
      header: 'Material',
      cell: (row) => (
        <span className="text-xs text-ink">
          {row.lines
            .filter((l) => l.outstanding > 0)
            .map((l) => `${l.item_name} ${n(l.outstanding)} ${l.unit}`)
            .join(', ')}
        </span>
      ),
    },
    {
      key: 'for',
      header: 'For',
      cell: (row) =>
        row.sent_ahead ? (
          <Badge tone="amber">Sent ahead</Badge>
        ) : (
          <Badge tone="blue">{row.request_code}</Badge>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) =>
        row.kind === 'dispatch' ? (
          <Badge tone="amber">On the way</Badge>
        ) : row.order?.status === 'partially_received' ? (
          <Badge tone="blue">Part arrived</Badge>
        ) : (
          <Badge tone="teal">Ordered</Badge>
        ),
    },
    {
      key: 'date',
      header: 'Since',
      cell: (row) => formatDate(row.date),
      sortValue: (row) => row.date,
    },
    {
      key: 'receive',
      header: '',
      align: 'right',
      cell: (row) =>
        mayAct ? (
          <Button size="sm" onClick={() => setReceiving(row)}>
            <PackageCheck className="size-4" /> Receive
          </Button>
        ) : null,
    },
  ];

  const qtyCell = (v: number, unit: string, tone?: string) =>
    v > 0.0005 ? (
      <span className={cn('font-medium', tone ?? 'text-ink')}>
        {n(v)} <span className="text-xs font-normal text-ink-muted">{unit}</span>
      </span>
    ) : (
      <span className="text-slate-300">—</span>
    );

  const materialColumns: Column<SiteMaterialRow>[] = [
    {
      key: 'item',
      header: 'Item',
      cell: (r) => (
        <div>
          <span className="font-medium text-ink">{r.item_name}</span>
          {r.in_use > 0.0005 && r.oldest_in_use_days >= SITE_AGEING_DAYS && (
            <span className="block text-[11px] text-amber-700">
              in use for {r.oldest_in_use_days} days, nothing recorded
            </span>
          )}
          {r.sending > 0.0005 && (
            <span className="block text-[11px] text-blue-700">
              {n(r.sending)} {r.unit} on the way back to the main store
            </span>
          )}
        </div>
      ),
      sortValue: (r) => r.item_name,
    },
    { key: 'received', header: 'Received', align: 'right', cell: (r) => qtyCell(r.received, r.unit), sortValue: (r) => r.received },
    { key: 'in_store', header: 'In store', align: 'right', cell: (r) => qtyCell(r.in_store, r.unit, 'text-admin-700'), sortValue: (r) => r.in_store },
    { key: 'in_use', header: 'In use', align: 'right', cell: (r) => qtyCell(r.in_use, r.unit, 'text-amber-700'), sortValue: (r) => r.in_use },
    { key: 'used', header: 'Used', align: 'right', cell: (r) => qtyCell(r.used, r.unit, 'text-emerald-700'), sortValue: (r) => r.used },
    {
      key: 'sent_back',
      header: 'Sent back',
      align: 'right',
      cell: (r) => qtyCell(r.sent_back + r.sending, r.unit),
      sortValue: (r) => r.sent_back + r.sending,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (r) => {
        if (!mayAct) return null;
        const onSite = r.in_store + r.in_use > 0.0005;
        if (!onSite) return null;
        const act = (mode: SiteMaterialMode) => {
          setMenu(null);
          setActing({ row: r, mode });
        };
        return (
          <div className="relative flex justify-end gap-1.5">
            {r.in_store > 0.0005 && (
              <Button size="sm" variant="outline" onClick={() => act('hand_out')}>
                <Hand className="size-4" /> Hand out
              </Button>
            )}
            <Button size="sm" onClick={() => act('use')}>
              <Hammer className="size-4" /> Mark used
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`More for ${r.item_name}`}
              onClick={() => setMenu(menu === r.id ? null : r.id)}
            >
              <MoreHorizontal className="size-4" />
            </Button>
            {menu === r.id && (
              <div className="absolute right-0 top-10 z-20 w-56 rounded-xl border border-hairline bg-white p-1 text-left shadow-lg">
                {r.in_use > 0.0005 && (
                  <MenuItem icon={Undo2} label="Back to site store" onClick={() => act('back_to_store')} />
                )}
                <MenuItem icon={ArrowDownToLine} label="Send back to main store" onClick={() => act('send_back')} />
                <MenuItem icon={PackageX} label="Write off" danger onClick={() => act('write_off')} />
              </div>
            )}
          </div>
        );
      },
    },
  ];

  const chips: { key: Chip; label: string }[] = [
    { key: 'all', label: `All (${materials?.length ?? 0})` },
    { key: 'in_store', label: `In store (${count((r) => r.in_store)})` },
    { key: 'in_use', label: `In use (${count((r) => r.in_use)})` },
    { key: 'used', label: `Used (${count((r) => r.used)})` },
    { key: 'sent_back', label: `Sent back (${count((r) => r.sent_back + r.sending)})` },
  ];

  const openRequests = (requests ?? []).filter((r) => !isRequestClosed(r.status)).length;

  return (
    <div>
      <SubTabs
        tabs={[
          { key: 'materials', label: 'Site materials' },
          { key: 'incoming', label: `Incoming (${incoming?.length ?? 0})` },
          { key: 'requests', label: `Requests (${openRequests} open)` },
        ]}
        active={sub}
        onChange={setSub}
        actions={
          canEdit(role, 'material_request') ? (
            <Link href={`/admin/material-requests/new?project=${projectId}`}>
              <Button size="sm">
                <ClipboardList className="size-4" /> Request material
              </Button>
            </Link>
          ) : undefined
        }
      />

      {sub === 'materials' && (
        <Card>
          <CardHeader
            title="Site materials"
            subtitle="Everything that reached this site: in the site store, in use on the work, used, sent back"
          />
          <div className="mb-3 flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setChip(c.key)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  chip === c.key
                    ? 'border-admin-500 bg-admin-500 text-white'
                    : 'border-hairline bg-white text-ink-muted hover:text-admin-700',
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
          <DataTable
            rows={shownMaterials}
            columns={materialColumns}
            initialSort={{ key: 'item', direction: 'asc' }}
            label="items"
            emptyState={
              <EmptyState
                icon={Warehouse}
                title={chip === 'all' ? 'Nothing has reached this site yet' : 'No item in this status'}
                description="Material shows here once the site receives it from Incoming."
              />
            }
          />
        </Card>
      )}

      {sub === 'incoming' && (
        <Card>
          <CardHeader
            title="Coming to this site"
            subtitle="Orders unloading here and material sent from the main store, with or without a request. Count it in with Receive."
          />
          <DataTable
            rows={incoming ?? []}
            columns={incomingColumns}
            initialSort={{ key: 'date', direction: 'asc' }}
            label="deliveries"
            emptyState={
              <EmptyState
                icon={Truck}
                title="Nothing on the way"
                description="When procurement orders for this site or sends material from the main store, it appears here to be received."
              />
            }
          />
        </Card>
      )}

      {sub === 'requests' && (
        <Card>
          <CardHeader
            title="Material requests"
            subtitle="Raised by the site, approved by the Project Manager, bought by procurement"
            action={
              <label className="flex items-center gap-2 text-xs text-ink-muted">
                <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
                Open only
              </label>
            }
          />
          <DataTable
            rows={shownRequests}
            columns={requestColumns}
            initialSort={{ key: 'request_date', direction: 'desc' }}
            label="requests"
            emptyState={
              <EmptyState
                icon={ClipboardList}
                title={openOnly ? 'No open request' : 'No request raised yet'}
                description="Ask for material with Request material."
              />
            }
          />
        </Card>
      )}

      <SiteReceiveModal delivery={receiving} atLabel="the site" onClose={() => setReceiving(null)} />
      <SiteMaterialActionModal
        projectId={projectId}
        row={acting?.row ?? null}
        mode={acting?.mode ?? null}
        onClose={() => setActing(null)}
      />
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: typeof Hand;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm',
        danger ? 'text-red-600 hover:bg-red-50' : 'text-ink hover:bg-admin-50',
      )}
    >
      <Icon className="size-4" /> {label}
    </button>
  );
}
