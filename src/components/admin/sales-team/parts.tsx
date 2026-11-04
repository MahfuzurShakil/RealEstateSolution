'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRightLeft, UserMinus, UserPlus } from 'lucide-react';
import { ErrorNote, useAction } from '@/components/admin/share-sale/ShareSaleModals';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Combobox } from '@/components/ui/Combobox';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useReadOnly } from '@/components/ui/ViewOnly';
import { useMockSession } from '@/lib/auth/mock-session';
import type { CommissionLineStatus, CommissionSaleKind, OrgMember } from '@/lib/db/types';
import { COMMISSION_LINE_STATUS_META } from '@/lib/domain/commission';
import { commissionLineRepository, orgMemberRepository, partnerRepository, syncCommissions, userRepository } from '@/lib/repositories';
import { formatBdt, todayLocal } from '@/lib/utils/format';

/** Reconciles commission with the payment ledgers once when a screen opens. */
export function useCommissionSync(): boolean {
  const [done, setDone] = useState(false);
  useEffect(() => {
    let live = true;
    syncCommissions()
      .catch(() => undefined)
      .finally(() => live && setDone(true));
    return () => {
      live = false;
    };
  }, []);
  return done;
}

export function LineStatusBadge({ status, toRecover }: { status: CommissionLineStatus; toRecover?: boolean | null }) {
  const m = COMMISSION_LINE_STATUS_META[status];
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge tone={m.tone}>{m.label}</Badge>
      {toRecover && status === 'paid' && <Badge tone="amber">To recover</Badge>}
    </span>
  );
}

/** The members a sale can be credited to, as picker options. */
export function useMemberOptions() {
  const members = useLiveQuery(() => orgMemberRepository.options(), []);
  return (members ?? []).map((m) => ({ id: m.id, label: m.name, hint: `${m.code} · ${m.designation}`, keywords: `${m.code} ${m.phone ?? ''} ${m.designation}` }));
}

/** "Sold by" for a share purchase or a booking, with the commission it carries (plan §6–7). */
export function SaleCommissionCard({ kind, saleId, soldBy, editable: allowed }: { kind: CommissionSaleKind; saleId: string; soldBy: string | null | undefined; editable: boolean }) {
  const readOnly = useReadOnly();
  const editable = allowed && !readOnly;
  const synced = useCommissionSync();
  const options = useMemberOptions();
  const lines = useLiveQuery(() => commissionLineRepository.forSale(kind, saleId), [kind, saleId, synced]);
  const [error, setError] = useState('');
  const seller = useLiveQuery(() => (soldBy ? orgMemberRepository.getById(soldBy) : Promise.resolve(undefined)), [soldBy]);

  const change = async (id: string | null) => {
    setError('');
    try {
      await orgMemberRepository.setSoldBy(kind, saleId, id);
      await syncCommissions();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    }
  };

  const people = [...new Map((lines ?? []).map((l) => [l.member_id, l])).values()];
  return (
    <Card>
      <CardHeader title="Sales commission" subtitle="Who sold it, and the commission released as the buyer pays." />
      <Field label="Sold by" hint={editable ? 'Commission follows the plan in force on the sale date.' : undefined}>
        {editable ? (
          <Combobox value={soldBy ?? null} options={options} onChange={change} placeholder="Pick a sales team member…" unlistedLabel={seller?.name ?? null} />
        ) : (
          <p className="text-sm font-medium text-ink">{seller ? `${seller.name} · ${seller.code}` : '—'}</p>
        )}
      </Field>
      <ErrorNote error={error} />
      {lines && lines.length > 0 ? (
        <div className="mt-4 space-y-3">
          {people.map((p) => {
            const mine = lines.filter((l) => l.member_id === p.member_id);
            return (
              <div key={p.member_id} className="rounded-xl border border-hairline p-3">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/admin/sales-team/members/${p.member_id}`} className="text-sm font-semibold text-admin-700 hover:underline">
                    {p.member?.name ?? '—'}
                  </Link>
                  <span className="text-xs text-ink-muted">
                    {p.role === 'seller' ? 'Seller' : 'Override'} · {p.designation_at_sale} · {formatBdt(mine.reduce((t, l) => t + l.amount, 0))}
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {mine.map((l) => (
                    <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="text-ink-muted">{l.stage_label}</span>
                      <span className="flex items-center gap-2">
                        <span className="tabular-nums">{formatBdt(l.amount)}</span>
                        <LineStatusBadge status={l.status} toRecover={l.to_recover} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 text-xs text-ink-muted">
          {soldBy ? 'No commission plan covers this sale on its date, so it carries no commission.' : 'Pick who sold it to work out the commission.'}
        </p>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Member dialogs
 * ------------------------------------------------------------------ */

/** Add a member (optionally under someone) or edit one. Reporting changes go through a move. */
export function MemberFormModal({ member, parentId, onClose }: { member?: OrgMember; parentId?: string | null; onClose: (saved?: OrgMember) => void }) {
  const { userId } = useMockSession();
  const designations = useLiveQuery(() => orgMemberRepository.designations(), []);
  const members = useLiveQuery(() => orgMemberRepository.options(), []);
  const users = useLiveQuery(() => userRepository.getAll(), []);
  const partners = useLiveQuery(() => partnerRepository.list(), []);
  const [f, setF] = useState({
    name: member?.name ?? '',
    phone: member?.phone ?? '',
    designation_id: member?.designation_id ?? '',
    parent_id: member ? member.parent_id : (parentId ?? null),
    user_id: member?.user_id ?? '',
    partner_id: member?.partner_id ?? '',
    joined_on: member?.joined_on ?? todayLocal(),
    notes: member?.notes ?? '',
  });
  const { error, busy, run } = useAction();
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  // until one is picked, the designation one step below the parent's
  const parent = members?.find((m) => m.id === f.parent_id);
  const below = designations?.length ? designations[Math.min((parent ? designations.findIndex((d) => d.id === parent.designation_id) : -1) + 1, designations.length - 1)].id : '';
  const designationId = f.designation_id || (member ? '' : below);

  return (
    <Modal
      open
      title={member ? `Edit ${member.name}` : 'Add a member'}
      subtitle={member ? member.code : parent ? `Reports to ${parent.name}` : 'At the top level of the organisation'}
      icon={UserPlus}
      onClose={() => onClose()}
      footer={
        <>
          <Button variant="outline" onClick={() => onClose()}>
            Cancel
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              let saved: OrgMember | undefined;
              void run(
                async () => {
                  saved = await orgMemberRepository.save({ ...f, designation_id: designationId, id: member?.id }, userId);
                },
                () => onClose(saved),
              );
            }}
          >
            {busy ? 'Saving…' : member ? 'Save changes' : 'Add member'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Name" required>
          <TextInput value={f.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Phone">
          <TextInput value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="01XXXXXXXXX" />
        </Field>
        <Field label="Designation" required hint="Names and order are set in Master Data → Org designation.">
          <SelectInput value={designationId} onChange={(e) => set('designation_id', e.target.value)}>
            <option value="">Pick a designation</option>
            {(designations ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.value}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Reports to" hint={member ? 'Changing this records a move dated today.' : undefined}>
          <Combobox
            value={f.parent_id}
            onChange={(id) => set('parent_id', id)}
            placeholder="Top level — reports to nobody"
            options={(members ?? []).filter((m) => m.id !== member?.id).map((m) => ({ id: m.id, label: m.name, hint: `${m.code} · ${m.designation}` }))}
          />
        </Field>
        <Field label="Joined on" required>
          <TextInput type="date" value={f.joined_on} onChange={(e) => set('joined_on', e.target.value)} />
        </Field>
        <Field label="Admin login" hint="Staff who log in; leave empty for an outside agent.">
          <SelectInput value={f.user_id} onChange={(e) => set('user_id', e.target.value)}>
            <option value="">No login</option>
            {(users ?? [])
              .filter((u) => u.status === 'active')
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
          </SelectInput>
        </Field>
        <Field label="Company partner" hint="A founder who also owns part of the company.">
          <SelectInput value={f.partner_id} onChange={(e) => set('partner_id', e.target.value)}>
            <option value="">Not a partner</option>
            {(partners ?? [])
              .filter((p) => !p.project_id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.share_pct}%
                </option>
              ))}
          </SelectInput>
        </Field>
        <Field label="Notes" className="md:col-span-2">
          <TextArea rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </div>
      <ErrorNote error={error} />
    </Modal>
  );
}

/** Puts a member (and their team) under someone else from a date; the old place stays in the history. */
export function MoveMemberModal({ member, toParentId, onClose }: { member: OrgMember; toParentId?: string | null; onClose: () => void }) {
  const { userId } = useMockSession();
  const members = useLiveQuery(() => orgMemberRepository.options(), []);
  const team = useLiveQuery(() => orgMemberRepository.teamIds(member.id), [member.id]);
  const [to, setTo] = useState<string | null>(toParentId === undefined ? null : toParentId);
  const [date, setDate] = useState(todayLocal());
  const [note, setNote] = useState('');
  const { error, busy, run } = useAction();
  const blocked = new Set([member.id, ...(team ?? [])]);
  const current = members?.find((m) => m.id === member.parent_id);

  return (
    <Modal
      open
      title={`Move ${member.name}`}
      subtitle={`Now reports to ${current?.name ?? 'nobody (top level)'}${team?.length ? ` · ${team.length} in their team move too` : ''}`}
      icon={ArrowRightLeft}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => run(() => orgMemberRepository.move(member.id, to, date, note, userId), onClose)}>
            {busy ? 'Moving…' : 'Move'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Reports to" className="md:col-span-2">
          <Combobox
            value={to}
            onChange={setTo}
            placeholder="Top level — reports to nobody"
            options={(members ?? []).filter((m) => !blocked.has(m.id)).map((m) => ({ id: m.id, label: m.name, hint: `${m.code} · ${m.designation}` }))}
          />
        </Field>
        <Field label="From" required hint="Sales before this date keep the old team for commission.">
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Note">
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. new team formed" />
        </Field>
      </div>
      <ErrorNote error={error} />
    </Modal>
  );
}

export function MarkLeftDialog({ member, onClose }: { member: OrgMember; onClose: () => void }) {
  const [date, setDate] = useState(todayLocal());
  const { error, busy, run } = useAction();
  return (
    <ConfirmDialog
      open
      tone="warning"
      icon={UserMinus}
      title={`${member.name} has left`}
      subtitle="Commission already worked out stays theirs; no new sales can be credited to them."
      confirmLabel={busy ? 'Saving…' : 'Mark as left'}
      busy={busy}
      onConfirm={() => run(() => orgMemberRepository.markLeft(member.id, date), onClose)}
      onCancel={onClose}
    >
      <Field label="Left on" required>
        <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <ErrorNote error={error} />
    </ConfirmDialog>
  );
}

/** A compact money summary of commission lines. */
export function CommissionSummary({ totals }: { totals: { pending: number; earned: number; approved: number; paid: number; to_recover: number } }) {
  const cells: [string, number, string?][] = [
    ['To come', totals.pending],
    ['Earned, to approve', totals.earned],
    ['Approved, to pay', totals.approved],
    ['Paid', totals.paid],
  ];
  if (totals.to_recover > 0) cells.push(['To recover', totals.to_recover, 'text-red-600']);
  return (
    <div className={`grid gap-px overflow-hidden rounded-xl border border-hairline bg-hairline text-sm grid-cols-2 ${cells.length === 5 ? 'sm:grid-cols-5' : 'sm:grid-cols-4'}`}>
      {cells.map(([k, v, cls]) => (
        <div key={k} className="bg-white px-4 py-3">
          <p className="text-xs text-ink-muted">{k}</p>
          <p className={`mt-0.5 font-semibold tabular-nums ${cls ?? ''}`}>{formatBdt(v)}</p>
        </div>
      ))}
    </div>
  );
}
