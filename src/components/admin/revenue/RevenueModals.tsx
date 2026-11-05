'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Banknote, CalendarRange, HandCoins, Landmark, LifeBuoy, Plus, Receipt, Settings2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, MoneyInput, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import {
  DISTRIBUTION_FREQUENCIES,
  ELIGIBILITY_RULES,
  LOSS_COVER_SOURCES,
  LOSS_RULES,
  MGMT_FEE_TYPES,
  REVENUE_ENTRY_FREQUENCIES,
  WITHDRAWAL_METHODS,
  WITHDRAWAL_WINDOWS,
  type LenderType,
  type LossCoverSource,
  type RevenueDirection,
  type RevenuePeriod,
  type RevenuePolicy,
  type WithdrawalMethod,
} from '@/lib/db/types';
import {
  DISTRIBUTION_FREQUENCY_LABEL,
  ELIGIBILITY_LABEL,
  ENTRY_FREQUENCY_LABEL,
  LENDER_TYPE_LABEL,
  LOSS_COVER_LABEL,
  LOSS_RULE_LABEL,
  MGMT_FEE_LABEL,
  WITHDRAWAL_METHOD_LABEL,
  WITHDRAWAL_WINDOW_LABEL,
} from '@/lib/domain/revenue-share';
import {
  DEFAULT_REVENUE_POLICY,
  bankAccountRepository,
  loanRepository,
  lookupRepository,
  lossCoveringRepository,
  partnerRepository,
  previewPeriod,
  profitWithdrawalRepository,
  revenueEntryRepository,
  revenuePeriodRepository,
  revenuePolicyRepository,
  type CoverLine,
  type HolderBalance,
  type LoanRow,
  type RevenuePolicyInput,
} from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt, formatDate, todayLocal } from '@/lib/utils/format';
import { FormError, ModalFooter, Waterfall } from './bits';

const fail = (e: unknown) => (e instanceof Error ? e.message : 'Could not save.');

function useAccounts() {
  return useLiveQuery(() => bankAccountRepository.options(), []) ?? [];
}

function AccountSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const accounts = useAccounts();
  return (
    <SelectInput value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Pick an account…</option>
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </SelectInput>
  );
}

/* ---------------------------------------------------------------- settings */

/** Plan §2.1 — turning revenue sharing on, or changing how it works. */
export function PolicyModal({ projectId, policy, onClose }: { projectId: string; policy?: RevenuePolicy; onClose: () => void }) {
  const { userId } = useMockSession();
  const [f, setF] = useState<RevenuePolicyInput>(() => {
    if (!policy) return { ...DEFAULT_REVENUE_POLICY };
    const rest: Partial<RevenuePolicy> = { ...policy };
    for (const k of ['id', 'created_at', 'updated_at', 'created_by', 'project_id'] as const) delete rest[k];
    return rest as RevenuePolicyInput;
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof RevenuePolicyInput>(k: K, v: RevenuePolicyInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const num = (k: keyof RevenuePolicyInput) => (e: { target: { value: string } }) => set(k, Number(e.target.value) as never);

  async function save() {
    setError('');
    setBusy(true);
    try {
      await revenuePolicyRepository.save(projectId, f, userId);
      onClose();
    } catch (e) {
      setError(fail(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      size="lg"
      icon={Settings2}
      title={policy ? 'Revenue sharing settings' : 'Turn on revenue sharing'}
      subtitle="How income is recorded, how often profit is shared, and the rules for sharing it"
      onClose={onClose}
      footer={<ModalFooter busy={busy} onClose={onClose} onSave={save} label={policy ? 'Save settings' : 'Turn on'} />}
    >
      <div className="space-y-5">
        <Section title="Recording and sharing">
          <Field label="Income and cost are typed" hint="A hotel types every day; a rented building once a month.">
            <SelectInput value={f.entry_frequency} onChange={(e) => set('entry_frequency', e.target.value as never)}>
              {REVENUE_ENTRY_FREQUENCIES.map((k) => (
                <option key={k} value={k}>
                  {ENTRY_FREQUENCY_LABEL[k]}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Profit is shared" required>
            <SelectInput value={f.distribution_frequency} onChange={(e) => set('distribution_frequency', e.target.value as never)}>
              {DISTRIBUTION_FREQUENCIES.map((k) => (
                <option key={k} value={k}>
                  {DISTRIBUTION_FREQUENCY_LABEL[k]}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="First period starts" required hint="Usually the day the business opened.">
            <TextInput type="date" value={f.first_period_start} onChange={(e) => set('first_period_start', e.target.value)} />
          </Field>
        </Section>

        <Section title="Before anything is shared">
          <Field label="Past losses">
            <SelectInput value={f.loss_rule} onChange={(e) => set('loss_rule', e.target.value as never)}>
              {LOSS_RULES.map((k) => (
                <option key={k} value={k}>
                  {LOSS_RULE_LABEL[k]}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Reserve kept back (%)" hint="For repairs and bad months.">
            <TextInput type="number" min={0} max={100} value={f.reserve_pct} onChange={num('reserve_pct')} />
          </Field>
          <Field label="Management fee">
            <SelectInput value={f.mgmt_fee_type} onChange={(e) => set('mgmt_fee_type', e.target.value as never)}>
              {MGMT_FEE_TYPES.map((k) => (
                <option key={k} value={k}>
                  {MGMT_FEE_LABEL[k]}
                </option>
              ))}
            </SelectInput>
          </Field>
          {f.mgmt_fee_type !== 'none' && (
            <Field label={f.mgmt_fee_type === 'fixed' ? 'Fee per period (Tk)' : 'Fee (%)'}>
              <TextInput type="number" min={0} value={f.mgmt_fee_value} onChange={num('mgmt_fee_value')} />
            </Field>
          )}
          <Checkbox
            className="sm:col-span-2"
            label="Set aside loan principal due in the period before sharing"
            checked={f.repay_loans_first}
            onChange={(e) => set('repay_loans_first', e.target.checked)}
          />
        </Section>

        <Section title="Who shares">
          <Field label="Customer holdings">
            <SelectInput value={f.eligibility_rule} onChange={(e) => set('eligibility_rule', e.target.value as never)}>
              {ELIGIBILITY_RULES.map((k) => (
                <option key={k} value={k}>
                  {ELIGIBILITY_LABEL[k]}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Tax withheld from each share (%)">
            <TextInput type="number" min={0} max={100} value={f.tax_withholding_pct} onChange={num('tax_withholding_pct')} />
          </Field>
          <Checkbox
            label="Count days held for shares bought mid-period"
            checked={f.prorate_days}
            onChange={(e) => set('prorate_days', e.target.checked)}
          />
          <Checkbox
            label="Pay overdue installments from the share first"
            checked={f.adjust_overdue_first}
            onChange={(e) => set('adjust_overdue_first', e.target.checked)}
          />
        </Section>

        <Section title="Customer withdrawals">
          <Field label="Minimum withdrawal (Tk)">
            <TextInput type="number" min={0} value={f.min_withdrawal} onChange={num('min_withdrawal')} />
          </Field>
          <Field label="Customers can ask">
            <SelectInput value={f.withdrawal_window} onChange={(e) => set('withdrawal_window', e.target.value as never)}>
              {WITHDRAWAL_WINDOWS.map((k) => (
                <option key={k} value={k}>
                  {WITHDRAWAL_WINDOW_LABEL[k]}
                </option>
              ))}
            </SelectInput>
          </Field>
          {f.withdrawal_window !== 'anytime' && (
            <Field label={f.withdrawal_window === 'after_declare' ? 'Days open after a declaration' : 'Day of the month'}>
              <TextInput type="number" min={1} value={f.withdrawal_window_days} onChange={num('withdrawal_window_days')} />
            </Field>
          )}
        </Section>
        <FormError error={error} />
      </div>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-hairline bg-white p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{title}</p>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}

/* ----------------------------------------------------------------- entries */

function useHeads() {
  const income = useLiveQuery(() => lookupRepository.options('revenue_income_head', null), []) ?? [];
  const cost = useLiveQuery(() => lookupRepository.options('revenue_expense_head', null), []) ?? [];
  return { income: income.map((h) => h.value), cost: cost.map((h) => h.value) };
}

/** One income or cost line. */
export function EntryModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { userId } = useMockSession();
  const heads = useHeads();
  const [direction, setDirection] = useState<RevenueDirection>('income');
  const [head, setHead] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [accountId, setAccountId] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const list = direction === 'income' ? heads.income : heads.cost;

  async function save() {
    setError('');
    setBusy(true);
    try {
      await revenueEntryRepository.record(
        {
          project_id: projectId,
          entry_date: date,
          direction,
          head,
          amount: Number(amount),
          account_id: accountId || null,
          reference_no: reference || null,
          notes: notes || null,
        },
        userId,
      );
      onClose();
    } catch (e) {
      setError(fail(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      icon={Receipt}
      title="Add income or cost"
      subtitle="Money the running business took in or paid out"
      onClose={onClose}
      footer={<ModalFooter busy={busy} onClose={onClose} onSave={save} label="Save" />}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {(['income', 'cost'] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                setDirection(d);
                setHead('');
              }}
              className={cn(
                'rounded-xl border px-3 py-2.5 text-sm font-medium',
                direction === d ? 'border-admin-500 bg-admin-50 text-admin-700 ring-1 ring-admin-500' : 'border-hairline bg-white text-ink-muted',
              )}
            >
              {d === 'income' ? 'Income' : 'Cost'}
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Head" required>
            <SelectInput value={head} onChange={(e) => setHead(e.target.value)}>
              <option value="">Pick…</option>
              {list.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Date" required>
            <TextInput type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Amount" required>
            <MoneyInput value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label={direction === 'income' ? 'Paid into' : 'Paid from'} required>
            <AccountSelect value={accountId} onChange={setAccountId} />
          </Field>
          <Field label="Invoice / voucher no.">
            <TextInput value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
          <Field label="Note">
            <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
        <FormError error={error} />
      </div>
    </Modal>
  );
}

/** Plan §2.2 — a day's register: one amount per head, typed like a ledger page. */
export function DaySheetModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { userId } = useMockSession();
  const heads = useHeads();
  const [date, setDate] = useState(todayLocal());
  const [accountId, setAccountId] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const total = (d: RevenueDirection) =>
    (d === 'income' ? heads.income : heads.cost).reduce((s, h) => s + (Number(values[`${d}::${h}`]) || 0), 0);

  async function save() {
    setError('');
    setBusy(true);
    try {
      const lines = Object.entries(values).map(([k, v]) => {
        const [direction, head] = k.split('::') as [RevenueDirection, string];
        return { direction, head, amount: Number(v) || 0 };
      });
      await revenueEntryRepository.recordDay(projectId, date, accountId || null, lines, userId);
      onClose();
    } catch (e) {
      setError(fail(e));
    } finally {
      setBusy(false);
    }
  }

  const column = (d: RevenueDirection) => (
    <div className="rounded-xl border border-hairline bg-white p-4">
      <p className="mb-3 flex justify-between text-xs font-semibold uppercase tracking-wide text-ink-muted">
        <span>{d === 'income' ? 'Income' : 'Cost'}</span>
        <span className="tabular-nums text-ink">{formatBdt(total(d))}</span>
      </p>
      <div className="space-y-2">
        {(d === 'income' ? heads.income : heads.cost).map((h) => (
          <label key={h} className="flex items-center gap-3">
            <span className="flex-1 text-sm text-ink">{h}</span>
            <TextInput
              type="number"
              min={0}
              inputMode="numeric"
              className="w-36 py-1.5 text-right"
              value={values[`${d}::${h}`] ?? ''}
              onChange={(e) => setValues((x) => ({ ...x, [`${d}::${h}`]: e.target.value }))}
            />
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <Modal
      open
      size="lg"
      icon={CalendarRange}
      title="Daily sheet"
      subtitle="Type the day's totals per head; empty heads are skipped"
      onClose={onClose}
      footer={
        <ModalFooter busy={busy} onClose={onClose} onSave={save} label={`Save · net ${formatBdt(total('income') - total('cost'))}`} />
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Day" required>
            <TextInput type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Account" required hint="Where the day's cash was banked and paid from.">
            <AccountSelect value={accountId} onChange={setAccountId} />
          </Field>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {column('income')}
          {column('cost')}
        </div>
        <FormError error={error} />
      </div>
    </Modal>
  );
}

/* ----------------------------------------------------------------- periods */

/** Plan §2.3 — the statement a period would close with; closing freezes it. */
export function ClosePeriodModal({ projectId, index, onClose }: { projectId: string; index: number; onClose: () => void }) {
  const { userId } = useMockSession();
  const preview = useLiveQuery(() => previewPeriod(projectId, index), [projectId, index]);
  const policy = useLiveQuery(() => revenuePolicyRepository.forProject(projectId), [projectId]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function close() {
    setError('');
    setBusy(true);
    try {
      await revenuePeriodRepository.close(projectId, index, userId);
      onClose();
    } catch (e) {
      setError(fail(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      size="lg"
      icon={CalendarRange}
      title={preview ? `${preview.dates.label} statement` : 'Statement'}
      subtitle={preview ? `${formatDate(preview.dates.start)} – ${formatDate(preview.dates.end)}` : undefined}
      onClose={onClose}
      footer={
        <ModalFooter busy={busy} onClose={onClose} onSave={close} label="Close period" disabled={!preview || !!preview.blocked} />
      }
    >
      {!preview ? (
        <p className="text-sm text-ink-muted">Working it out…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-hairline bg-white p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">By head</p>
            {preview.heads.length === 0 && <p className="text-sm text-ink-muted">Nothing recorded in this period.</p>}
            {preview.heads.map((h) => (
              <p key={`${h.direction}${h.head}`} className="flex justify-between py-1 text-sm">
                <span className="text-ink-muted">{h.head}</span>
                <span className={cn('tabular-nums', h.direction === 'cost' ? 'text-red-600' : 'text-ink')}>
                  {h.direction === 'cost' ? '− ' : ''}
                  {formatBdt(h.amount)}
                </span>
              </p>
            ))}
          </div>
          <div className="rounded-xl border border-hairline bg-white p-4">
            <Waterfall s={preview.statement} reservePct={policy?.reserve_pct} />
          </div>
          <div className="md:col-span-2 space-y-2">
            {preview.blocked ? (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">{preview.blocked}</p>
            ) : (
              <p className="text-xs text-ink-muted">
                Closing freezes these figures and locks the period&apos;s entries. Management then approves how much to share.
              </p>
            )}
            <FormError error={error} />
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------- loans */

interface LoanFields {
  lender_name: string;
  partner_id: string;
  phone: string;
  bank_branch: string;
  loan_account_no: string;
  interest_pct: string;
  repay_by: string;
  monthly_instalment: string;
}

const EMPTY_LOAN: LoanFields = {
  lender_name: '',
  partner_id: '',
  phone: '',
  bank_branch: '',
  loan_account_no: '',
  interest_pct: '0',
  repay_by: '',
  monthly_instalment: '0',
};

function LenderFields({ type, f, set }: { type: LenderType; f: LoanFields; set: (k: keyof LoanFields, v: string) => void }) {
  const partners = useLiveQuery(() => partnerRepository.list(), []) ?? [];
  return (
    <>
      {type === 'partner' ? (
        <Field label="Partner" required>
          <SelectInput value={f.partner_id} onChange={(e) => set('partner_id', e.target.value)}>
            <option value="">Pick…</option>
            {partners
              .filter((p) => p.is_active)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </SelectInput>
        </Field>
      ) : (
        <Field label={type === 'bank' ? 'Bank' : 'Lender name'} required>
          <TextInput value={f.lender_name} onChange={(e) => set('lender_name', e.target.value)} />
        </Field>
      )}
      {type === 'bank' ? (
        <>
          <Field label="Branch">
            <TextInput value={f.bank_branch} onChange={(e) => set('bank_branch', e.target.value)} />
          </Field>
          <Field label="Loan / OD account no.">
            <TextInput value={f.loan_account_no} onChange={(e) => set('loan_account_no', e.target.value)} />
          </Field>
        </>
      ) : type === 'person' ? (
        <Field label="Phone">
          <TextInput value={f.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
      ) : null}
      <Field label="Interest (% a year)" hint="0 is common between relatives and partners.">
        <TextInput type="number" min={0} value={f.interest_pct} onChange={(e) => set('interest_pct', e.target.value)} />
      </Field>
      <Field label="Principal repaid each month (Tk)">
        <TextInput type="number" min={0} value={f.monthly_instalment} onChange={(e) => set('monthly_instalment', e.target.value)} />
      </Field>
      <Field label="Repay by">
        <TextInput type="date" value={f.repay_by} onChange={(e) => set('repay_by', e.target.value)} />
      </Field>
    </>
  );
}

function loanTerms(f: LoanFields) {
  return {
    lender_name: f.lender_name,
    phone: f.phone || null,
    bank_branch: f.bank_branch || null,
    loan_account_no: f.loan_account_no || null,
    interest_pct: Number(f.interest_pct) || 0,
    repay_by: f.repay_by || null,
    monthly_instalment: Number(f.monthly_instalment) || 0,
  };
}

/** Borrowed money for the project; it comes in as a `loan` fund receipt. */
export function LoanModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { userId } = useMockSession();
  const [type, setType] = useState<LenderType>('bank');
  const [f, setF] = useState<LoanFields>(EMPTY_LOAN);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [accountId, setAccountId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setError('');
    setBusy(true);
    try {
      await loanRepository.take(
        {
          ...loanTerms(f),
          project_id: projectId,
          lender_type: type,
          partner_id: f.partner_id || null,
          principal: Number(amount),
          taken_on: date,
          account_id: accountId,
        },
        userId,
      );
      onClose();
    } catch (e) {
      setError(fail(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      size="lg"
      icon={Landmark}
      title="Take a loan"
      subtitle="Money borrowed for this project, from a person, a bank or a partner"
      onClose={onClose}
      footer={<ModalFooter busy={busy} onClose={onClose} onSave={save} label="Record loan" />}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {(['person', 'bank', 'partner'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={cn(
                'rounded-xl border px-3 py-2.5 text-sm font-medium',
                type === t ? 'border-admin-500 bg-admin-50 text-admin-700 ring-1 ring-admin-500' : 'border-hairline bg-white text-ink-muted',
              )}
            >
              {LENDER_TYPE_LABEL[t]}
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <LenderFields type={type} f={f} set={(k, v) => setF((x) => ({ ...x, [k]: v }))} />
          <Field label="Amount borrowed" required>
            <MoneyInput value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Received on" required>
            <TextInput type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Went into" required>
            <AccountSelect value={accountId} onChange={setAccountId} />
          </Field>
        </div>
        <FormError error={error} />
      </div>
    </Modal>
  );
}

export function RepayModal({ row, onClose }: { row: LoanRow; onClose: () => void }) {
  const { userId } = useMockSession();
  const [principal, setPrincipal] = useState(String(Math.min(row.outstanding, row.loan.monthly_instalment || row.outstanding)));
  const [interest, setInterest] = useState('0');
  const [date, setDate] = useState(todayLocal());
  const [accountId, setAccountId] = useState(row.loan.account_id);
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setError('');
    setBusy(true);
    try {
      await loanRepository.repay(
        row.loan.id,
        { paid_on: date, principal: Number(principal) || 0, interest: Number(interest) || 0, account_id: accountId, reference_no: reference || null },
        userId,
      );
      onClose();
    } catch (e) {
      setError(fail(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      icon={Banknote}
      title={`Repay ${row.loan.lender_name}`}
      subtitle={`${row.loan.code} · ${formatBdt(row.outstanding)} still owed`}
      onClose={onClose}
      footer={<ModalFooter busy={busy} onClose={onClose} onSave={save} label="Record repayment" />}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Principal">
          <MoneyInput value={principal} onChange={(e) => setPrincipal(e.target.value)} />
        </Field>
        <Field label="Interest" hint="Also recorded as a running cost.">
          <MoneyInput value={interest} onChange={(e) => setInterest(e.target.value)} />
        </Field>
        <Field label="Paid on" required>
          <TextInput type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Paid from" required>
          <AccountSelect value={accountId} onChange={setAccountId} />
        </Field>
        <Field label="Reference" className="sm:col-span-2">
          <TextInput value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <FormError error={error} />
        </div>
      </div>
    </Modal>
  );
}

/* --------------------------------------------------------------- loss cover */

interface CoverDraft {
  source: LossCoverSource;
  amount: string;
  account_id: string;
  f: LoanFields;
}

/** Plan §3 — how the money to keep running was found when the period lost money. */
export function CoverLossModal({ period, uncovered, onClose }: { period: RevenuePeriod; uncovered: number; onClose: () => void }) {
  const { userId } = useMockSession();
  const [lines, setLines] = useState<CoverDraft[]>([{ source: 'person_loan', amount: String(uncovered), account_id: '', f: EMPTY_LOAN }]);
  const [date, setDate] = useState(todayLocal());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const partners = useLiveQuery(() => partnerRepository.list(), []) ?? [];
  const total = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const patch = (i: number, p: Partial<CoverDraft>) => setLines((x) => x.map((l, j) => (j === i ? { ...l, ...p } : l)));

  async function save() {
    setError('');
    setBusy(true);
    try {
      const out: CoverLine[] = lines.map((l) => ({
        source: l.source,
        amount: Number(l.amount) || 0,
        account_id: l.account_id || null,
        partner_id: l.f.partner_id || null,
        loan: l.source.endsWith('_loan') ? { ...loanTerms(l.f), account_id: l.account_id } : null,
      }));
      await lossCoveringRepository.cover(period.id, out, date, userId);
      onClose();
    } catch (e) {
      setError(fail(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      size="lg"
      icon={LifeBuoy}
      title={`How was the ${period.label} loss covered?`}
      subtitle={`${formatBdt(uncovered)} still to account for`}
      onClose={onClose}
      footer={<ModalFooter busy={busy} onClose={onClose} onSave={save} label={`Record ${formatBdt(total)}`} />}
    >
      <div className="space-y-4">
        <Field label="Money came in on" className="max-w-xs">
          <TextInput type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {lines.map((l, i) => {
          const isLoan = l.source.endsWith('_loan');
          const needsAccount = isLoan || l.source === 'partner_capital';
          return (
            <div key={i} className="rounded-xl border border-hairline bg-white p-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Source">
                  <SelectInput value={l.source} onChange={(e) => patch(i, { source: e.target.value as LossCoverSource })}>
                    {LOSS_COVER_SOURCES.map((s) => (
                      <option key={s} value={s}>
                        {LOSS_COVER_LABEL[s]}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="Amount">
                  <MoneyInput value={l.amount} onChange={(e) => patch(i, { amount: e.target.value })} />
                </Field>
                {needsAccount && (
                  <Field label="Went into">
                    <AccountSelect value={l.account_id} onChange={(v) => patch(i, { account_id: v })} />
                  </Field>
                )}
                {isLoan && (
                  <LenderFields
                    type={l.source === 'bank_loan' ? 'bank' : l.source === 'partner_loan' ? 'partner' : 'person'}
                    f={l.f}
                    set={(k, v) => patch(i, { f: { ...l.f, [k]: v } })}
                  />
                )}
                {l.source === 'partner_capital' && (
                  <Field label="Partner">
                    <SelectInput value={l.f.partner_id} onChange={(e) => patch(i, { f: { ...l.f, partner_id: e.target.value } })}>
                      <option value="">Pick…</option>
                      {partners
                        .filter((p) => p.is_active)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </SelectInput>
                  </Field>
                )}
              </div>
              {lines.length > 1 && (
                <button
                  type="button"
                  className="mt-3 inline-flex items-center gap-1 text-xs text-ink-muted hover:text-red-600"
                  onClick={() => setLines((x) => x.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-3.5" /> Remove this source
                </button>
              )}
            </div>
          );
        })}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setLines((x) => [...x, { source: 'bank_loan', amount: String(Math.max(0, uncovered - total)), account_id: '', f: EMPTY_LOAN }])}
        >
          <Plus className="size-4" /> Another source
        </Button>
        <FormError error={error} />
      </div>
    </Modal>
  );
}

/* ----------------------------------------------------------------- payouts */

/** The office pays a holder's balance — a partner, or a customer who asked at the desk. */
export function OfficeWithdrawalModal({ balance, onClose }: { balance: HolderBalance; onClose: () => void }) {
  const { userId } = useMockSession();
  const [amount, setAmount] = useState(String(balance.balance));
  const [method, setMethod] = useState<WithdrawalMethod>('bank_transfer');
  const [payTo, setPayTo] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setError('');
    setBusy(true);
    try {
      await profitWithdrawalRepository.request(
        {
          holder_type: balance.holder_type,
          holder_id: balance.holder_id,
          project_id: balance.project_id,
          amount: Number(amount),
          method,
          pay_to: payTo,
          channel: 'office',
        },
        userId,
      );
      onClose();
    } catch (e) {
      setError(fail(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      icon={HandCoins}
      title={`Pay ${balance.holder_name}`}
      subtitle={`${balance.project_name} · balance ${formatBdt(balance.balance)}`}
      onClose={onClose}
      footer={<ModalFooter busy={busy} onClose={onClose} onSave={save} label="Create payout request" />}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount" required>
          <MoneyInput value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Method">
          <SelectInput value={method} onChange={(e) => setMethod(e.target.value as WithdrawalMethod)}>
            {WITHDRAWAL_METHODS.map((m) => (
              <option key={m} value={m}>
                {WITHDRAWAL_METHOD_LABEL[m]}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Pay to" required className="sm:col-span-2" hint="Bank account, wallet number or cheque name.">
          <TextInput value={payTo} onChange={(e) => setPayTo(e.target.value)} />
        </Field>
        <p className="text-xs text-ink-muted sm:col-span-2">It joins Profit Withdrawals, where Accounts marks it paid.</p>
        <div className="sm:col-span-2">
          <FormError error={error} />
        </div>
      </div>
    </Modal>
  );
}

/** Accounts records the payment of a request. */
export function PayWithdrawalModal({ id, amount, who, onClose }: { id: string; amount: number; who: string; onClose: () => void }) {
  const { userId } = useMockSession();
  const [accountId, setAccountId] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setError('');
    setBusy(true);
    try {
      await profitWithdrawalRepository.markPaid(id, { account_id: accountId, paid_on: date, reference_no: reference }, userId);
      onClose();
    } catch (e) {
      setError(fail(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      icon={Banknote}
      title={`Pay ${formatBdt(amount)}`}
      subtitle={`To ${who}`}
      onClose={onClose}
      footer={<ModalFooter busy={busy} onClose={onClose} onSave={save} label="Mark paid" />}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Paid from" required>
          <AccountSelect value={accountId} onChange={setAccountId} />
        </Field>
        <Field label="Paid on" required>
          <TextInput type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Transaction / cheque no." className="sm:col-span-2">
          <TextInput value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <FormError error={error} />
        </div>
      </div>
    </Modal>
  );
}

/** A reason is required: the customer sees it. */
export function RejectWithdrawalModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { userId } = useMockSession();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await profitWithdrawalRepository.reject(id, reason, userId);
      onClose();
    } catch (e) {
      setError(fail(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      tone="danger"
      icon={Trash2}
      title="Reject this request"
      subtitle="The amount goes back to the balance"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={save} disabled={busy}>
            Reject
          </Button>
        </>
      }
    >
      <Field label="Reason" required>
        <TextArea value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="mt-3">
        <FormError error={error} />
      </div>
    </Modal>
  );
}
