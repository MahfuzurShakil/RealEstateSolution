'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Building2,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Users as UsersIcon,
} from 'lucide-react';
import { UserFormModal } from '@/components/admin/users/UserFormModal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectInput, TextInput } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  USER_ROLES,
  USER_STATUSES,
  type User,
  type UserRole,
  type UserStatus,
} from '@/lib/db/types';
import {
  ACCESS_LEVEL_LABEL,
  ACCESS_LEVEL_TONE,
  MODULE_KEYS,
  MODULE_LABEL,
  USER_ROLE_META,
  USER_STATUS_META,
  permissionFor,
} from '@/lib/domain/access';
import type { UserWithAccess } from '@/lib/repositories';
import { userRepository } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatDate, formatPhone } from '@/lib/utils/format';

type Tab = 'people' | 'matrix';

/** Staff accounts and the permission matrix behind them (Section 9). */
export default function UsersPage() {
  const [tab, setTab] = useState<Tab>('people');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<UserRole | 'all'>('all');
  const [status, setStatus] = useState<UserStatus | 'all'>('all');
  const [editing, setEditing] = useState<User | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserWithAccess | null>(null);
  const [deleteBlocked, setDeleteBlocked] = useState<string | null>(null);

  const users = useLiveQuery(
    () => userRepository.list({ search, role, status }),
    [search, role, status],
  );
  const total = useLiveQuery(() => userRepository.count(), []);
  const counts = useLiveQuery(() => userRepository.countByRole(), []);

  const rows = useMemo(() => users ?? [], [users]);
  const loading = users === undefined;
  const hasAny = (total ?? 0) > 0;
  const activeCount = rows.filter((u) => u.status === 'active').length;

  async function requestDelete(user: UserWithAccess) {
    const refs = await userRepository.referenceCounts(user.id);
    if (refs.total > 0) {
      setDeleteBlocked(
        `${user.name} is recorded against ${refs.detail.join(', ')}. Deleting the account would leave those records without a "who did this", so it stays — set them Inactive instead, which keeps the history and stops new work being assigned.`,
      );
      return;
    }
    setDeleteTarget(user);
  }

  const columns: Column<UserWithAccess>[] = [
    {
      key: 'name',
      header: 'Person',
      cell: (row) => (
        <span className="font-medium text-ink">
          {row.name}
          <span className="block text-xs font-normal text-ink-muted">{row.email}</span>
        </span>
      ),
      sortValue: (row) => row.name,
    },
    {
      key: 'role',
      header: 'Role',
      cell: (row) => (
        <Badge tone={USER_ROLE_META[row.role].tone}>{USER_ROLE_META[row.role].label}</Badge>
      ),
      sortValue: (row) => row.role,
    },
    {
      key: 'phone',
      header: 'Phone',
      cell: (row) => formatPhone(row.phone),
      sortValue: (row) => row.phone,
    },
    {
      key: 'projects',
      header: 'Project access',
      cell: (row) => {
        if (row.all_projects) {
          return <Badge tone="teal">All projects</Badge>;
        }
        if (row.assigned_projects.length === 0) {
          return <span className="text-xs text-amber-600">Nothing assigned</span>;
        }
        return (
          <span className="flex flex-wrap gap-1">
            {row.assigned_projects.slice(0, 2).map((p) => (
              <Badge key={p.id} tone="blue">
                <Building2 className="size-3.5" />
                {p.name}
              </Badge>
            ))}
            {row.assigned_projects.length > 2 && (
              <Badge tone="neutral">+{row.assigned_projects.length - 2}</Badge>
            )}
          </span>
        );
      },
      sortValue: (row) => (row.all_projects ? 'zzz' : String(row.assigned_projects.length)),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => (
        <Badge tone={USER_STATUS_META[row.status].tone}>{USER_STATUS_META[row.status].label}</Badge>
      ),
      sortValue: (row) => row.status,
    },
    {
      key: 'created_at',
      header: 'Added',
      cell: (row) => formatDate(row.created_at),
      sortValue: (row) => row.created_at,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (row) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-label={`${row.status === 'active' ? 'Deactivate' : 'Activate'} ${row.name}`}
            title={row.status === 'active' ? 'Deactivate' : 'Activate'}
            onClick={() =>
              userRepository.setStatus(row.id, row.status === 'active' ? 'inactive' : 'active')
            }
          >
            <ShieldCheck
              className={cn('size-4', row.status === 'active' ? 'text-emerald-600' : 'text-slate-400')}
            />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Edit ${row.name}`}
            onClick={() => {
              setEditing(row);
              setModalOpen(true);
            }}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Delete ${row.name}`}
            onClick={() => requestDelete(row)}
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
        title="Users & Roles"
        subtitle="Who works here, what their role lets them open, and which projects they can reach."
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            <Plus className="size-4" /> New User
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap gap-2 border-b border-hairline">
        {([
          { key: 'people' as Tab, label: `People (${total ?? 0})` },
          { key: 'matrix' as Tab, label: 'Roles & Permissions' },
        ]).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
              tab === t.key
                ? 'border-admin-500 text-admin-700'
                : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'people' && (
        <Card>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <TextInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, phone, email…"
                className="pr-9"
              />
            </div>
            <SelectInput
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole | 'all')}
              className="w-auto"
              aria-label="Filter by role"
            >
              <option value="all">All roles</option>
              {USER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {USER_ROLE_META[r].label}
                  {counts?.[r] ? ` (${counts[r]})` : ''}
                </option>
              ))}
            </SelectInput>
            <SelectInput
              value={status}
              onChange={(e) => setStatus(e.target.value as UserStatus | 'all')}
              className="w-auto"
              aria-label="Filter by status"
            >
              <option value="all">All statuses</option>
              {USER_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {USER_STATUS_META[st].label}
                </option>
              ))}
            </SelectInput>
            <p className="ml-auto text-sm text-ink-muted">
              {loading ? 'Loading…' : `${rows.length} shown · ${activeCount} active`}
            </p>
          </div>

          {loading ? (
            <div className="h-40 animate-pulse rounded-2xl bg-canvas" />
          ) : (
            <DataTable
              rows={rows}
              columns={columns}
              initialSort={{ key: 'name' }}
              label="users"
              mobileCard={(row) => (
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{row.name}</p>
                      <p className="truncate text-xs text-ink-muted">{row.email}</p>
                      <p className="truncate text-xs text-ink-muted">{formatPhone(row.phone)}</p>
                    </div>
                    {/*
                      The row actions stay on the card: on a phone this is the
                      only way to reach them, and the table's icon column is
                      hidden with the rest of the table.
                    */}
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`${row.status === 'active' ? 'Deactivate' : 'Activate'} ${row.name}`}
                        onClick={() =>
                          userRepository.setStatus(
                            row.id,
                            row.status === 'active' ? 'inactive' : 'active',
                          )
                        }
                      >
                        <ShieldCheck
                          className={cn(
                            'size-4',
                            row.status === 'active' ? 'text-emerald-600' : 'text-slate-400',
                          )}
                        />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Edit ${row.name}`}
                        onClick={() => {
                          setEditing(row);
                          setModalOpen(true);
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Delete ${row.name}`}
                        onClick={() => requestDelete(row)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={USER_ROLE_META[row.role].tone}>
                      {USER_ROLE_META[row.role].label}
                    </Badge>
                    <Badge tone={USER_STATUS_META[row.status].tone}>
                      {USER_STATUS_META[row.status].label}
                    </Badge>
                    {row.all_projects ? (
                      <Badge tone="teal">All projects</Badge>
                    ) : row.assigned_projects.length === 0 ? (
                      <span className="text-xs text-amber-600">Nothing assigned</span>
                    ) : (
                      <Badge tone="blue">
                        <Building2 className="size-3.5" />
                        {row.assigned_projects.length} project
                        {row.assigned_projects.length === 1 ? '' : 's'}
                      </Badge>
                    )}
                  </div>

                  <p className="text-xs text-ink-muted">Added {formatDate(row.created_at)}</p>
                </div>
              )}
              emptyState={
                <EmptyState
                  icon={UsersIcon}
                  title={hasAny ? 'No user matches these filters' : 'No user yet'}
                  description={
                    hasAny
                      ? 'Try clearing the role or status filter.'
                      : 'Add the staff who use this platform — their role decides what they can open.'
                  }
                  action={
                    <Button
                      onClick={() => {
                        setEditing(null);
                        setModalOpen(true);
                      }}
                    >
                      <Plus className="size-4" /> New User
                    </Button>
                  }
                />
              }
            />
          )}

          <p className="mt-4 text-xs text-ink-muted">
            Phase A simulates the signed-in role from the topbar rather than asking anyone to log in
            (Section 0). These accounts are what records are attributed to, and what Phase B turns
            into real logins.
          </p>
        </Card>
      )}

      {tab === 'matrix' && <PermissionMatrix />}

      <UserFormModal
        open={modalOpen}
        user={editing ?? undefined}
        onClose={() => setModalOpen(false)}
        onSaved={() => setModalOpen(false)}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Delete ${deleteTarget?.name ?? ''}`}
        confirmLabel="Delete user"
        message="The account and its project assignments are removed. Nothing has been recorded against this person, so no history is lost."
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) await userRepository.removeCascade(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />

      <ConfirmDialog
        open={deleteBlocked !== null}
        title="This user cannot be deleted"
        tone="warning"
        message={deleteBlocked ?? ''}
        confirmLabel="Understood"
        cancelLabel="Close"
        onCancel={() => setDeleteBlocked(null)}
        onConfirm={() => setDeleteBlocked(null)}
      />
    </>
  );
}

/**
 * Section 9.6 shown, not edited.
 *
 * Section 9.2 chose a fixed ENUM over a role-builder, and the checks are in
 * code — so an editable grid here would promise a flexibility the rest of the
 * application does not have. Read-only is the honest rendering.
 */
function PermissionMatrix() {
  return (
    <Card>
      <CardHeader
        title="Permission matrix"
        action={<span className="text-xs text-ink-muted">Section 9.6 — fixed in code</span>}
      />

      <div className="overflow-x-auto rounded-2xl border border-hairline">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead className="bg-canvas">
            <tr>
              <th className="sticky left-0 z-10 bg-canvas px-4 py-3 text-left font-medium text-ink">
                Module
              </th>
              {USER_ROLES.map((r) => (
                <th key={r} className="px-3 py-3 text-left font-medium text-ink-muted">
                  {USER_ROLE_META[r].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MODULE_KEYS.map((moduleKey, index) => (
              <tr key={moduleKey} className={index % 2 === 1 ? 'bg-canvas/40' : undefined}>
                <td className="sticky left-0 z-10 bg-inherit px-4 py-2.5 font-medium text-ink">
                  {MODULE_LABEL[moduleKey]}
                </td>
                {USER_ROLES.map((r) => {
                  const permission = permissionFor(r, moduleKey);
                  if (permission.level === 'none') {
                    return (
                      <td key={r} className="px-3 py-2.5 text-slate-300">
                        —
                      </td>
                    );
                  }
                  return (
                    <td key={r} className="px-3 py-2.5">
                      <Badge tone={ACCESS_LEVEL_TONE[permission.level]}>
                        {ACCESS_LEVEL_LABEL[permission.level]}
                        {permission.scoped ? ' (assigned)' : ''}
                      </Badge>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 space-y-2 text-xs text-ink-muted">
        <p>
          <span className="font-medium text-ink">Own only</span> — records they created or were
          assigned. <span className="font-medium text-ink">(assigned)</span> — limited to the
          projects on their account (Section 9.5).
        </p>
        <p>
          This table is what the sidebar and the route guard read, so a role genuinely cannot open a
          module marked “—”. Phase A simulates the role rather than authenticating it, so it steers
          people away from the wrong screen; Phase B moves the same matrix behind the API, where it
          becomes a real boundary.
        </p>
        <p>
          Roles are a fixed list rather than something an admin can invent (Section 9.2). If the
          business genuinely outgrows these ten, a permissions table is the Phase 2 answer — not a
          grid here that the code would ignore.
        </p>
      </div>
    </Card>
  );
}
