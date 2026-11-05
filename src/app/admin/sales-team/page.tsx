'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRightLeft, ChevronDown, ChevronRight, GripVertical, Network, Plus, TrendingUp, UserPlus, Users } from 'lucide-react';
import { Kpi } from '@/components/admin/share-sale/bits';
import { MemberFormModal, MoveMemberModal } from '@/components/admin/sales-team/parts';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterBar, FilterSelect } from '@/components/ui/FilterBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { useReadOnly } from '@/components/ui/ViewOnly';
import type { OrgMember } from '@/lib/db/types';
import { orgMemberRepository, type OrgNode } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt } from '@/lib/utils/format';

type Dialog = { kind: 'add'; parentId: string | null } | { kind: 'move'; member: OrgMember; to?: string | null } | null;

function matches(n: OrgNode, q: string, designation: string): boolean {
  const byText = !q || `${n.member.name} ${n.member.code} ${n.member.phone ?? ''}`.toLowerCase().includes(q);
  return byText && (designation === 'all' || n.member.designation_id === designation);
}

/** A branch stays on screen while it, or anyone under it, matches the filter. */
function keeps(n: OrgNode, q: string, designation: string): boolean {
  return matches(n, q, designation) || n.children.some((c) => keeps(c, q, designation));
}

/**
 * Sales Team → Org Chart (REVENUE-SHARE-PLAN.md §6): the organisation as a
 * collapsible tree, any depth. Drag a card onto another to move someone (with
 * their team) under them; the move is dated, so past commission keeps the old
 * tree. Each card shows the team size and the sales of the whole branch.
 */
export default function OrgChartPage() {
  const tree = useLiveQuery(() => orgMemberRepository.tree(), []);
  const designations = useLiveQuery(() => orgMemberRepository.designations(), []);
  const readOnly = useReadOnly();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [designation, setDesignation] = useState('all');
  const [showLeft, setShowLeft] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [dragging, setDragging] = useState<OrgMember | null>(null);
  const [over, setOver] = useState<string | null>(null);

  if (!tree) return <p className="text-sm text-ink-muted">Loading…</p>;

  const needle = q.trim().toLowerCase();
  const filtered = Boolean(needle || designation !== 'all');
  const prune = (nodes: OrgNode[]): OrgNode[] => nodes.filter((n) => showLeft || n.member.status === 'active').filter((n) => keeps(n, needle, designation));
  const roots = prune(tree);
  const all: OrgNode[] = [];
  const walk = (ns: OrgNode[]) => ns.forEach((n) => (all.push(n), walk(n.children)));
  walk(tree);
  const active = all.filter((n) => n.member.status === 'active');
  const salesTotal = tree.reduce((t, n) => t + n.branch_sales, 0);
  const salesCount = tree.reduce((t, n) => t + n.branch_sales_count, 0);
  const toggle = (id: string) =>
    setCollapsed((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const drop = (target: OrgNode | null) => {
    setOver(null);
    if (!dragging || readOnly) return;
    if (target?.member.id === dragging.id) return;
    setDialog({ kind: 'move', member: dragging, to: target?.member.id ?? null });
    setDragging(null);
  };

  const renderNode = (n: OrgNode, depth: number) => {
    const kids = prune(n.children);
    const open = filtered || !collapsed.has(n.member.id);
    const dim = filtered && !matches(n, needle, designation);
    const left = n.member.status === 'left';
    return (
      <li key={n.member.id}>
        <div
          draggable={!readOnly && !left}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            setDragging(n.member);
          }}
          onDragEnd={() => {
            setDragging(null);
            setOver(null);
          }}
          onDragOver={(e) => {
            if (!dragging || dragging.id === n.member.id || left) return;
            e.preventDefault();
            setOver(n.member.id);
          }}
          onDragLeave={() => setOver((o) => (o === n.member.id ? null : o))}
          onDrop={(e) => {
            e.preventDefault();
            drop(n);
          }}
          className={cn(
            'group flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-white px-3 py-2.5 shadow-sm transition-colors',
            over === n.member.id ? 'border-admin-500 bg-admin-50' : 'border-hairline',
            dim && 'opacity-50',
            left && 'bg-slate-50',
          )}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {kids.length > 0 ? (
              <button type="button" onClick={() => toggle(n.member.id)} className="grid size-6 shrink-0 place-items-center rounded-md text-ink-muted hover:bg-admin-50 hover:text-admin-700" aria-label={open ? `Collapse ${n.member.name}` : `Expand ${n.member.name}`}>
                {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              </button>
            ) : (
              <span className="size-6 shrink-0" />
            )}
            {!readOnly && !left && <GripVertical className="hidden size-4 shrink-0 cursor-grab text-slate-300 sm:block" aria-hidden />}
            <div className="min-w-0">
              <Link href={`/admin/sales-team/members/${n.member.id}`} className="font-medium text-ink hover:text-admin-700 hover:underline">
                {n.member.name}
              </Link>
              <p className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                <Badge tone={n.rank <= 1 ? 'teal' : 'neutral'}>{n.designation}</Badge>
                {n.member.code}
                {n.partner_name && <Badge tone="blue">Partner</Badge>}
                {n.user_name && <Badge tone="neutral">Login</Badge>}
                {left && <Badge tone="amber">Left</Badge>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-right text-xs tabular-nums">
            <span>
              <span className="block text-ink-muted">Team</span>
              <span className="font-semibold text-ink">{n.team_size}</span>
            </span>
            <span>
              <span className="block text-ink-muted">Own sales</span>
              <span className="font-semibold text-ink">{formatBdt(n.own_sales)}</span>
            </span>
            <span>
              <span className="block text-ink-muted">Branch · {n.branch_sales_count}</span>
              <span className="font-semibold text-admin-700">{formatBdt(n.branch_sales)}</span>
            </span>
            {!readOnly && !left && (
              <span className="flex gap-1">
                <button type="button" onClick={() => setDialog({ kind: 'add', parentId: n.member.id })} className="grid size-8 place-items-center rounded-lg text-ink-muted hover:bg-admin-50 hover:text-admin-700" title={`Add under ${n.member.name}`} aria-label={`Add under ${n.member.name}`}>
                  <UserPlus className="size-4" />
                </button>
                <button type="button" onClick={() => setDialog({ kind: 'move', member: n.member })} className="grid size-8 place-items-center rounded-lg text-ink-muted hover:bg-admin-50 hover:text-admin-700" title={`Move ${n.member.name}`} aria-label={`Move ${n.member.name}`}>
                  <ArrowRightLeft className="size-4" />
                </button>
              </span>
            )}
          </div>
        </div>
        {open && kids.length > 0 && (
          <ul className={cn('mt-2 space-y-2 border-l border-dashed border-admin-200 pl-3 sm:pl-6', depth > 3 && 'sm:pl-4')}>{kids.map((c) => renderNode(c, depth + 1))}</ul>
        )}
      </li>
    );
  };

  return (
    <>
      <PageHeader
        title="Org Chart"
        subtitle="The sales organisation, any depth. Drag a person onto someone to move them and their team."
        action={
          <Button onClick={() => setDialog({ kind: 'add', parentId: null })}>
            <Plus className="size-4" /> Add member
          </Button>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Kpi label="Active members" value={active.length} hint={`${all.length - active.length} left`} icon={Users} />
        <Kpi label="Top level" value={tree.filter((n) => n.member.status === 'active').length} hint="report to nobody" icon={Network} />
        <Kpi label="Sales credited" value={formatBdt(salesTotal)} hint={`${salesCount} sale${salesCount === 1 ? '' : 's'}, share purchases and bookings`} icon={TrendingUp} />
      </div>

      <Card>
        <FilterBar
          search={{ value: q, onChange: setQ, placeholder: 'Name, code or phone…' }}
          onReset={() => {
            setQ('');
            setDesignation('all');
          }}
          isFiltered={filtered}
        >
          <FilterSelect label="Designation" value={designation} onChange={(e) => setDesignation(e.target.value)}>
            <option value="all">All designations</option>
            {(designations ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.value}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Show" value={showLeft ? 'all' : 'active'} onChange={(e) => setShowLeft(e.target.value === 'all')}>
            <option value="active">Active members</option>
            <option value="all">Include those who left</option>
          </FilterSelect>
        </FilterBar>

        {roots.length === 0 ? (
          <EmptyState
            icon={Network}
            title={filtered ? 'Nobody matches' : 'No members yet'}
            description={filtered ? 'Change or reset the filters.' : 'Add the founders first, then their teams under them.'}
          />
        ) : (
          <>
            <ul className="space-y-2">{roots.map((n) => renderNode(n, 0))}</ul>
            {dragging && !readOnly && (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver('top');
                }}
                onDragLeave={() => setOver(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  drop(null);
                }}
                className={cn('mt-3 rounded-xl border-2 border-dashed px-4 py-3 text-center text-sm', over === 'top' ? 'border-admin-500 bg-admin-50 text-admin-700' : 'border-hairline text-ink-muted')}
              >
                Drop here to move {dragging.name} to the top level
              </div>
            )}
          </>
        )}
      </Card>

      {dialog?.kind === 'add' && <MemberFormModal parentId={dialog.parentId} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'move' && <MoveMemberModal member={dialog.member} toParentId={dialog.to} onClose={() => setDialog(null)} />}
    </>
  );
}
