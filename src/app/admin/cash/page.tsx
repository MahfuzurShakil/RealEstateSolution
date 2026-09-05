'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Landmark,
  Plus,
  Smartphone,
  Wallet,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, SelectInput, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { useMockSession } from '@/lib/auth/mock-session';
import { BANK_ACCOUNT_TYPES, type BankAccount, type BankAccountType } from '@/lib/db/types';
import { canEdit } from '@/lib/domain/access';
import { CASH_FLOW_LABEL, type CashFlowRow } from '@/lib/domain/cash';
import type { AccountWithPosition } from '@/lib/repositories';
import { bankAccountRepository } from '@/lib/repositories';
import { formatBdt, formatDate, todayLocal } from '@/lib/utils/format';

const TYPE_META: Record<BankAccountType, { label: string; icon: typeof Landmark }> = {
  bank: { label: 'Bank', icon: Landmark },
  mfs: { label: 'bKash / Nagad', icon: Smartphone },
  cash: { label: 'Cash in hand', icon: Banknote },
};

/**
 * Where the money is (Tier 3.5, Section 8.3 addendum).
 *
 * Money enters through `payments` and leaves through `expenses`,
 * `supplier_vouchers` and `refunds`, and until now no screen showed the net —
 * so the owner could not answer "can I pay BSRM on Thursday". What counts and
 * what deliberately does not is defined in `lib/domain/cash.ts`.
 */
export default function CashPositionPage() {
  const { role, userId } = useMockSession();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [statementFor, setStatementFor] = useState<AccountWithPosition | null>(null);

  const position = useLiveQuery(() => bankAccountRepository.position(), []);
  const mayEdit = canEdit(role, 'finance_expense');

  if (position === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;

  const columns: Column<AccountWithPosition>[] = [
    {
      key: 'name',
      header: 'Account',
      cell: (row) => {
        const Icon = TYPE_META[row.type].icon;
        return (
          <span className="flex items-center gap-2">
            <Icon className="size-4 shrink-0 text-admin-600" />
            <span className="min-w-0">
              <span className="block font-medium text-ink">
                {row.name}
                {!row.is_active && (
                  <Badge tone="neutral" className="ml-2">
                    Closed
                  </Badge>
                )}
              </span>
              <span className="block text-xs text-ink-muted">
                {row.code}
                {row.bank_name ? ` · ${row.bank_name}` : ''}
                {row.account_number ? ` · ${row.account_number}` : ''}
              </span>
            </span>
          </span>
        );
      },
      sortValue: (row) => row.name,
    },
    {
      key: 'opening_balance',
      header: 'Opening',
      align: 'right',
      cell: (row) => (
        <span className="text-sm text-ink">
          {formatBdt(row.opening_balance)}
          <span className="block text-xs text-ink-muted">
            at {formatDate(row.opening_balance_date)}
          </span>
        </span>
      ),
      sortValue: (row) => row.opening_balance,
    },
    {
      key: 'money_in',
      header: 'In',
      align: 'right',
      cell: (row) => <span className="text-emerald-700">{formatBdt(row.money_in)}</span>,
      sortValue: (row) => row.money_in,
    },
    {
      key: 'money_out',
      header: 'Out',
      align: 'right',
      cell: (row) => <span className="text-red-600">{formatBdt(row.money_out)}</span>,
      sortValue: (row) => row.money_out,
    },
    {
      key: 'closing_balance',
      header: 'Balance',
      align: 'right',
      cell: (row) => (
        <span
          className={`font-semibold ${
            row.closing_balance < 0 ? 'text-red-600' : 'text-ink'
          }`}
        >
          {formatBdt(row.closing_balance)}
        </span>
      ),
      sortValue: (row) => row.closing_balance,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (row) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => setStatementFor(row)}>
            Statement
          </Button>
          {mayEdit && (
            <Button size="sm" variant="ghost" onClick={() => setEditing(row)}>
              Edit
            </Button>
          )}
        </div>
      ),
    },
  ];

  const tiles = [
    {
      label: 'Cash on hand',
      value: position.total_balance,
      hint: 'across every account',
      icon: Wallet,
    },
    { label: 'Money in', value: position.total_in, hint: 'buyer receipts', icon: ArrowDownLeft },
    {
      label: 'Money out',
      value: position.total_out,
      hint: 'costs, suppliers, refunds',
      icon: ArrowUpRight,
    },
  ];

  return (
    <>
      <PageHeader
        title="Cash Position"
        subtitle="What is actually in the accounts — receipts in, costs, supplier payments and refunds out."
        action={
          mayEdit ? (
            <Button onClick={() => setAdding(true)}>
              <Plus className="size-4" /> New account
            </Button>
          ) : undefined
        }
      />

      {position.accounts.length > 0 && (
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          {tiles.map((tile) => (
            <Card key={tile.label} className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-admin-50 text-admin-600">
                <tile.icon className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs text-ink-muted">{tile.label}</p>
                <p className="truncate text-lg font-semibold text-ink">{formatBdt(tile.value)}</p>
                <p className="truncate text-[11px] text-ink-muted">{tile.hint}</p>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/*
        Money recorded before accounts existed, or entered without one. Kept
        out of the balance above on purpose: a total that silently absorbed it
        would reconcile against no bank statement, which is the one thing this
        page is for.
      */}
      {position.unattributed_count > 0 && (
        <p className="mb-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            {position.unattributed_count} movement
            {position.unattributed_count === 1 ? '' : 's'} — {formatBdt(position.unattributed_in)} in
            and {formatBdt(position.unattributed_out)} out — are not against any account, so they
            are <span className="font-medium">not</span> in the balance above. Set the account on
            them and the figure becomes something a bank statement can be checked against.
          </span>
        </p>
      )}

      <Card>
        <CardHeader title="Accounts" />
        <DataTable
          rows={position.accounts}
          columns={columns}
          label="accounts"
          emptyState={
            <EmptyState
              icon={Landmark}
              title="No account yet"
              description="Add the bank accounts, mobile wallets and cash box the company actually uses. Each one carries an opening balance, so the position is a real balance rather than only the movement since this software was installed."
              action={
                mayEdit ? <Button onClick={() => setAdding(true)}>Add an account</Button> : undefined
              }
            />
          }
          mobileCard={(row) => (
            <div className="space-y-1">
              <p className="font-medium text-ink">{row.name}</p>
              <p className="text-xs text-ink-muted">
                {TYPE_META[row.type].label} · {row.code}
              </p>
              <p className="text-sm">
                <span className="font-semibold text-ink">{formatBdt(row.closing_balance)}</span>
                <span className="text-ink-muted">
                  {' '}
                  · {formatBdt(row.money_in)} in · {formatBdt(row.money_out)} out
                </span>
              </p>
            </div>
          )}
        />
      </Card>

      {(adding || editing) && (
        <AccountModal
          account={editing}
          userId={userId}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      )}

      {statementFor && (
        <StatementModal account={statementFor} onClose={() => setStatementFor(null)} />
      )}
    </>
  );
}

function AccountModal({
  account,
  userId,
  onClose,
}: {
  account: BankAccount | null;
  userId: string | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<BankAccountType>(account?.type ?? 'bank');
  const [bankName, setBankName] = useState(account?.bank_name ?? '');
  const [accountNumber, setAccountNumber] = useState(account?.account_number ?? '');
  const [branch, setBranch] = useState(account?.branch ?? '');
  const [opening, setOpening] = useState(account ? String(account.opening_balance) : '');
  const [openingDate, setOpeningDate] = useState(account?.opening_balance_date ?? todayLocal());
  const [isActive, setIsActive] = useState(account?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  return (
    <Modal
      open
      onClose={onClose}
      title={account ? 'Edit account' : 'New account'}
      subtitle={account?.code}
      icon={Landmark}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            disabled={saving || !name.trim()}
            onClick={async () => {
              setSaving(true);
              try {
                const payload = {
                  name,
                  type,
                  bank_name: bankName.trim() || null,
                  account_number: accountNumber.trim() || null,
                  branch: branch.trim() || null,
                  opening_balance: Number(opening) || 0,
                  opening_balance_date: openingDate,
                  is_active: isActive,
                  notes: null,
                };
                if (account) await bankAccountRepository.update(account.id, payload);
                else await bankAccountRepository.createAccount(payload, userId);
                onClose();
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? 'Saving…' : account ? 'Save changes' : 'Add account'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required className="sm:col-span-2">
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. DBBL Current — Banani"
          />
        </Field>
        <Field label="Type" required>
          <SelectInput value={type} onChange={(e) => setType(e.target.value as BankAccountType)}>
            {BANK_ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_META[t].label}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Bank">
          <TextInput value={bankName} onChange={(e) => setBankName(e.target.value)} />
        </Field>
        <Field label="Account number">
          <TextInput
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            placeholder="Optional"
          />
        </Field>
        <Field label="Branch">
          <TextInput value={branch} onChange={(e) => setBranch(e.target.value)} />
        </Field>
        <Field
          label="Opening balance"
          hint="What was in the account on the date below"
        >
          <TextInput
            type="number"
            step="any"
            value={opening}
            onChange={(e) => setOpening(e.target.value)}
            placeholder="0"
          />
        </Field>
        <Field
          label="Opening balance date"
          required
          hint="Movements before this date are already inside the figure and are not added again"
        >
          <TextInput
            type="date"
            value={openingDate}
            onChange={(e) => setOpeningDate(e.target.value)}
          />
        </Field>
        {account && (
          <Field label="Status" className="sm:col-span-2">
            <SelectInput
              value={isActive ? 'active' : 'closed'}
              onChange={(e) => setIsActive(e.target.value === 'active')}
            >
              <option value="active">Open</option>
              <option value="closed">Closed — hidden from the pickers</option>
            </SelectInput>
          </Field>
        )}
      </div>
    </Modal>
  );
}

/** One account's movements, out of all four money tables. */
function StatementModal({
  account,
  onClose,
}: {
  account: AccountWithPosition;
  onClose: () => void;
}) {
  const rows = useLiveQuery(() => bankAccountRepository.movements(account.id), [account.id]);

  const columns: Column<CashFlowRow & { id: string }>[] = [
    {
      key: 'date',
      header: 'Date',
      cell: (row) => formatDate(row.date),
      sortValue: (row) => row.date,
    },
    {
      key: 'label',
      header: 'Detail',
      cell: (row) => (
        <span className="min-w-0">
          <span className="block truncate font-medium text-ink">{row.label}</span>
          <span className="block truncate text-xs text-ink-muted">
            {CASH_FLOW_LABEL[row.kind]}
            {row.reference ? ` · ${row.reference}` : ''}
          </span>
        </span>
      ),
      sortValue: (row) => row.label,
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      cell: (row) => (
        <span className={row.amount >= 0 ? 'text-emerald-700' : 'text-red-600'}>
          {row.amount >= 0 ? '+' : '−'}
          {formatBdt(Math.abs(row.amount))}
        </span>
      ),
      sortValue: (row) => row.amount,
    },
  ];

  return (
    <Modal
      open
      onClose={onClose}
      title={account.name}
      subtitle={`${formatBdt(account.closing_balance)} — opening ${formatBdt(
        account.opening_balance,
      )} at ${formatDate(account.opening_balance_date)}`}
      icon={Landmark}
      footer={
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      {rows === undefined ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : (
        <DataTable
          rows={rows}
          columns={columns}
          label="movements"
          emptyState={
            <p className="py-6 text-center text-sm text-ink-muted">
              Nothing has moved through this account yet.
            </p>
          }
        />
      )}
    </Modal>
  );
}
