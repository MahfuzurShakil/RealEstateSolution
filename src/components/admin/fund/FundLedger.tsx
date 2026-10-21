'use client';

import { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { ExportCsvButton } from '@/components/ui/ExportCsvButton';
import { FilterBar, FilterField, FilterSelect } from '@/components/ui/FilterBar';
import { TextInput } from '@/components/ui/Field';
import { Pagination, usePagination } from '@/components/ui/Pagination';
import { CASH_FLOW_LABEL, type CashFlowRow } from '@/lib/domain/cash';
import type { LedgerRow } from '@/lib/repositories';
import type { CsvColumn } from '@/lib/utils/csv';
import { cn } from '@/lib/utils/cn';
import { formatBdt, formatDate } from '@/lib/utils/format';

const CSV: CsvColumn<LedgerRow>[] = [
  { header: 'Date', value: (r) => r.date },
  { header: 'Type', value: (r) => CASH_FLOW_LABEL[r.kind] },
  { header: 'Detail', value: (r) => r.label },
  { header: 'Reference', value: (r) => r.reference ?? '' },
  { header: 'Account', value: (r) => r.account_name },
  { header: 'In', value: (r) => (r.amount > 0 ? r.amount : '') },
  { header: 'Out', value: (r) => (r.amount < 0 ? -r.amount : '') },
  { header: 'Company balance after', value: (r) => r.running },
];

/**
 * Every taka in and out, filterable and paged. Newest first by default — the
 * question is usually "what moved lately" — with the running company balance
 * still worked out oldest-first, so each row shows the balance right after it
 * whatever the filters.
 */
export function FundLedger({ ledger }: { ledger: { opening: number; rows: LedgerRow[] } }) {
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<'all' | CashFlowRow['kind']>('all');
  const [direction, setDirection] = useState<'all' | 'in' | 'out'>('all');
  const [account, setAccount] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [newestFirst, setNewestFirst] = useState(true);

  const accounts = useMemo(() => [...new Set(ledger.rows.map((r) => r.account_name))].sort(), [ledger.rows]);
  const kinds = useMemo(() => [...new Set(ledger.rows.map((r) => r.kind))], [ledger.rows]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = ledger.rows.filter(
      (r) =>
        (kind === 'all' || r.kind === kind) &&
        (direction === 'all' || (direction === 'in' ? r.amount > 0 : r.amount < 0)) &&
        (account === 'all' || r.account_name === account) &&
        (!from || r.date >= from) &&
        (!to || r.date <= to) &&
        (!q || `${r.label} ${r.reference ?? ''}`.toLowerCase().includes(q)),
    );
    return newestFirst ? [...out].reverse() : out;
  }, [ledger.rows, search, kind, direction, account, from, to, newestFirst]);

  const paging = usePagination(rows, 25);
  const moneyIn = rows.reduce((s, r) => s + (r.amount > 0 ? r.amount : 0), 0);
  const moneyOut = rows.reduce((s, r) => s + (r.amount < 0 ? -r.amount : 0), 0);
  const filtered = search !== '' || kind !== 'all' || direction !== 'all' || account !== 'all' || from !== '' || to !== '';
  const closing = ledger.rows.at(-1)?.running ?? ledger.opening;

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl border border-hairline p-3 text-sm sm:grid-cols-4">
        <Stat label={filtered ? 'Money in (filtered)' : 'Money in'} value={formatBdt(moneyIn)} />
        <Stat label={filtered ? 'Money out (filtered)' : 'Money out'} value={formatBdt(moneyOut)} />
        <Stat label="Opening balances" value={formatBdt(ledger.opening)} />
        <Stat label="Balance now" value={formatBdt(closing)} strong />
      </div>

      <FilterBar
        search={{ value: search, onChange: setSearch, placeholder: 'Name, detail or reference' }}
        isFiltered={filtered}
        onReset={() => {
          setSearch('');
          setKind('all');
          setDirection('all');
          setAccount('all');
          setFrom('');
          setTo('');
        }}
      >
        <FilterSelect label="In / out" value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)}>
          <option value="all">Both</option>
          <option value="in">Money in</option>
          <option value="out">Money out</option>
        </FilterSelect>
        <FilterSelect label="Type" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="all">All types</option>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {CASH_FLOW_LABEL[k]}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Account" value={account} onChange={(e) => setAccount(e.target.value)}>
          <option value="all">All accounts</option>
          {accounts.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </FilterSelect>
        <FilterField label="From">
          <TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" />
        </FilterField>
        <FilterField label="To">
          <TextInput type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto" />
        </FilterField>
        <div className="ml-auto flex items-end gap-2">
          <FilterSelect
            label="Order"
            value={newestFirst ? 'new' : 'old'}
            onChange={(e) => setNewestFirst(e.target.value === 'new')}
          >
            <option value="new">Newest first</option>
            <option value="old">Oldest first</option>
          </FilterSelect>
          <ExportCsvButton rows={rows} columns={CSV} filenamePrefix="fund-ledger" label="Export" />
        </div>
      </FilterBar>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-xs text-ink-muted">
              <th className="py-2.5 pr-3 font-medium">Date</th>
              <th className="py-2.5 pr-3 font-medium">Detail</th>
              <th className="py-2.5 pr-3 font-medium">Account</th>
              <th className="py-2.5 pr-3 text-right font-medium">In</th>
              <th className="py-2.5 pr-3 text-right font-medium">Out</th>
              <th className="py-2.5 text-right font-medium" title="The company's balance right after this entry">
                Balance after
              </th>
            </tr>
          </thead>
          <tbody>
            {paging.pageRows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-ink-muted">
                  {ledger.rows.length === 0 ? 'No money has moved through an account yet.' : 'Nothing matches these filters.'}
                </td>
              </tr>
            )}
            {paging.pageRows.map((r) => {
              const isIn = r.amount > 0;
              return (
                <tr key={`${r.kind}-${r.id}`} className="border-b border-hairline last:border-0 hover:bg-slate-50/70">
                  <td className="whitespace-nowrap py-2.5 pr-3 text-ink-muted">{formatDate(r.date)}</td>
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={cn(
                          'grid size-7 shrink-0 place-items-center rounded-full',
                          isIn ? 'bg-admin-50 text-admin-600' : 'bg-orange-50 text-accent-coral',
                        )}
                      >
                        {isIn ? <ArrowDownLeft className="size-3.5" /> : <ArrowUpRight className="size-3.5" />}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-ink">{r.label}</p>
                        <p className="text-xs text-ink-muted">
                          {CASH_FLOW_LABEL[r.kind]}
                          {r.reference ? ` · ${r.reference}` : ''}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 pr-3 text-ink-muted">{r.account_name}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-emerald-700">{isIn ? formatBdt(r.amount) : ''}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-ink">{!isIn ? formatBdt(-r.amount) : ''}</td>
                  <td className={cn('py-2.5 text-right font-medium tabular-nums', r.running < 0 ? 'text-red-600' : 'text-ink')}>
                    {formatBdt(r.running)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pagination
        page={paging.page}
        pageCount={paging.pageCount}
        pageSize={paging.pageSize}
        total={paging.total}
        from={paging.from}
        to={paging.to}
        onPageChange={paging.setPage}
        onPageSizeChange={paging.setPageSize}
        pageSizes={[25, 50, 100]}
        label="entries"
        alwaysVisible
      />
    </>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={cn('mt-0.5 tabular-nums text-ink', strong ? 'font-semibold' : 'font-medium')}>{value}</p>
    </div>
  );
}
