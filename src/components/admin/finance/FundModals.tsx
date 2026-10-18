'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDownToLine, HandCoins, PieChart, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import type { FundSourceType, Partner } from '@/lib/db/types';
import {
  bankAccountRepository,
  fundAllocationRepository,
  fundReceiptRepository,
  partnerRepository,
  projectRepository,
  type FundOverview,
  type ProjectFundRow,
} from '@/lib/repositories';
import { formatBdt, todayLocal } from '@/lib/utils/format';

function Footer({ busy, onClose, onSave, label }: { busy: boolean; onClose: () => void; onSave: () => void; label: string }) {
  return (
    <>
      <Button variant="outline" onClick={onClose} disabled={busy}>
        Cancel
      </Button>
      <Button onClick={onSave} disabled={busy}>
        {busy ? 'Saving…' : label}
      </Button>
    </>
  );
}

/** Add or edit a partner and their share of the company. */
export function PartnerModal({ partner, shareTotal, onClose }: { partner?: Partner; shareTotal: number; onClose: () => void }) {
  const { userId } = useMockSession();
  const [name, setName] = useState(partner?.name ?? '');
  const [phone, setPhone] = useState(partner?.phone ?? '');
  const [nid, setNid] = useState(partner?.nid ?? '');
  const [share, setShare] = useState(partner ? String(partner.share_pct) : '');
  const [active, setActive] = useState(partner?.is_active ?? true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const free = Math.round((100 - shareTotal + (partner?.is_active ? partner.share_pct : 0)) * 100) / 100;

  async function save() {
    setError('');
    setBusy(true);
    try {
      await partnerRepository.save(
        { id: partner?.id, name, phone: phone || null, nid: nid || null, share_pct: Number(share) || 0, is_active: active, notes: null },
        userId,
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open size="sm" icon={UserPlus} title={partner ? `Edit ${partner.name}` : 'Add partner'} subtitle="Someone who puts capital into the business" onClose={onClose} footer={<Footer busy={busy} onClose={onClose} onSave={save} label="Save partner" />}>
      <div className="grid gap-4">
        <Field label="Name" required>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Karim Uddin" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone">
            <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="NID">
            <TextInput value={nid} onChange={(e) => setNid(e.target.value)} />
          </Field>
        </div>
        <Field label="Share of the company (%)" required hint={`${free}% is not given to anyone yet`}>
          <TextInput type="number" min={0} max={100} step="any" value={share} onChange={(e) => setShare(e.target.value)} />
        </Field>
        {partner && (
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" className="size-4 accent-admin-600" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Still a partner
          </label>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}

const SOURCE_LABEL: Record<FundSourceType, string> = {
  partner_capital: "Partner's capital",
  loan: 'Loan',
  other: 'Other',
};

/** Money coming in that is not a sale: capital, a loan, anything else. */
export function MoneyInModal({ onClose }: { onClose: () => void }) {
  const { userId } = useMockSession();
  const partners = useLiveQuery(() => partnerRepository.list(), []);
  const accounts = useLiveQuery(() => bankAccountRepository.options(), []);
  const projects = useLiveQuery(() => projectRepository.list(), []);
  const [source, setSource] = useState<FundSourceType>('partner_capital');
  const [partnerId, setPartnerId] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [projectId, setProjectId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setError('');
    setBusy(true);
    try {
      await fundReceiptRepository.record(
        {
          source_type: source,
          partner_id: partnerId || null,
          source_name: sourceName || null,
          project_id: projectId || null,
          account_id: accountId,
          amount: Number(amount) || 0,
          receipt_date: date,
          reference_no: reference || null,
          notes: notes || null,
        },
        userId,
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open size="md" icon={ArrowDownToLine} title="Money in" subtitle="Capital, a loan or other money that is not a sale" onClose={onClose} footer={<Footer busy={busy} onClose={onClose} onSave={save} label={`Record ${formatBdt(Number(amount) || 0)}`} />}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Source" required>
          <SelectInput value={source} onChange={(e) => setSource(e.target.value as FundSourceType)}>
            {(Object.keys(SOURCE_LABEL) as FundSourceType[]).map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABEL[s]}
              </option>
            ))}
          </SelectInput>
        </Field>
        {source === 'partner_capital' ? (
          <Field label="Partner" required>
            <SelectInput value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
              <option value="">Select…</option>
              {(partners ?? []).filter((p) => p.is_active).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.share_pct}%)
                </option>
              ))}
            </SelectInput>
          </Field>
        ) : (
          <Field label={source === 'loan' ? 'Lender' : 'From'} required>
            <TextInput value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder={source === 'loan' ? 'e.g. City Bank term loan' : ''} />
          </Field>
        )}
        <Field label="Into account" required>
          <SelectInput value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Select…</option>
            {(accounts ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="For" hint="Company pool, or straight to one project">
          <SelectInput value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Company pool</option>
            {(projects ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Amount (BDT)" required>
          <TextInput type="number" min={0} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Date" required>
          <TextInput type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Reference" className="sm:col-span-2">
          <TextInput value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Cheque no., bank ref…" />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </Modal>
  );
}

/** Parent → project: earmark part of the company pool for one project. */
export function AllocateModal({ overview, onClose }: { overview: FundOverview; onClose: () => void }) {
  const { userId } = useMockSession();
  const projects = useLiveQuery(() => projectRepository.list(), []);
  const [projectId, setProjectId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setError('');
    setBusy(true);
    try {
      await fundAllocationRepository.allocate(
        { project_id: projectId, amount: Number(amount) || 0, allocation_date: date, notes: notes || null },
        userId,
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open size="sm" icon={HandCoins} title="Give to a project" subtitle={`From the company pool — ${formatBdt(overview.pool.unallocated)} not yet given`} onClose={onClose} footer={<Footer busy={busy} onClose={onClose} onSave={save} label="Give" />}>
      <div className="grid gap-4">
        <Field label="Project" required>
          <SelectInput value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Select…</option>
            {(projects ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Amount (BDT)" required>
          <TextInput type="number" min={0} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Date" required>
          <TextInput type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Notes">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}

/** A project's own partner split, or back to the company's. */
export function ProjectSharesModal({ row, partners, onClose }: { row: ProjectFundRow; partners: Partner[]; onClose: () => void }) {
  const { userId } = useMockSession();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(partners.map((p) => [p.id, String(row.shares.find((s) => s.partner_id === p.id)?.share_pct ?? 0)])),
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const total = Object.values(values).reduce((s, v) => s + (Number(v) || 0), 0);

  async function save(reset: boolean) {
    setError('');
    setBusy(true);
    try {
      await partnerRepository.setProjectShares(
        row.project_id,
        reset ? [] : partners.map((p) => ({ partner_id: p.id, share_pct: Number(values[p.id]) || 0 })),
        userId,
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      size="sm"
      icon={PieChart}
      title={`Partners in ${row.project_name}`}
      subtitle="Who carries this project's cost, if not the company split"
      onClose={onClose}
      footer={
        <>
          {row.own_split && (
            <Button variant="ghost" onClick={() => save(true)} disabled={busy}>
              Use company split
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => save(false)} disabled={busy}>
            Save split
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        {partners.map((p) => (
          <label key={p.id} className="flex items-center gap-3">
            <span className="min-w-0 flex-1 text-sm text-ink">
              {p.name} <span className="text-xs text-ink-muted">(company {p.share_pct}%)</span>
            </span>
            <TextInput
              type="number"
              min={0}
              max={100}
              step="any"
              className="w-24"
              value={values[p.id] ?? '0'}
              onChange={(e) => setValues((v) => ({ ...v, [p.id]: e.target.value }))}
            />
            <span className="text-sm text-ink-muted">%</span>
          </label>
        ))}
        <p className={total === 100 ? 'text-right text-sm text-ink-muted' : 'text-right text-sm font-medium text-amber-700'}>
          Total {Math.round(total * 100) / 100}%
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}
